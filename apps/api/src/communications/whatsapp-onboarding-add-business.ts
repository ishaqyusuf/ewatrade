import {
  COUNTRIES,
  currencyForCountry,
  findCountry,
} from "@ewatrade/utils/countries"
import {
  type OperatingCurrencyCode,
  isOperatingCurrencyCode,
} from "@ewatrade/utils/currency"
import type {
  WhatsAppOnboardingAdapters,
  WhatsAppOnboardingButton,
  WhatsAppOnboardingChoice,
  WhatsAppOnboardingMessage,
  WhatsAppOnboardingResult,
  WhatsAppOnboardingState,
} from "./whatsapp-onboarding"

/**
 * In-chat Add business for an already-linked account (design case c-addbiz-n).
 * Deterministic and server-private: facts are collected here, the review is
 * explicit, email proof precedes creation, and creation itself is the canonical
 * owner-business command behind the `addBusiness` adapter. Nothing reaches the model.
 */

/** `countryCode: null` is the explicit "Other · USD" choice. */
export type WhatsAppAddBusinessDraft = {
  businessName?: string
  countryCode?: string | null
  currencyCode?: OperatingCurrencyCode
  addressLine1?: string
  city?: string
  phone?: string
}

export type WhatsAppAddBusinessComplete = Required<
  Omit<WhatsAppAddBusinessDraft, "countryCode">
> & { countryCode: string | null }

export type WhatsAppAddBusinessAccount = {
  userId: string
  email: string
  ownerName: string | null
  businessName: string
  storeName: string
}

export type WhatsAppAddBusinessCreateResult =
  | { kind: "created"; choice: WhatsAppOnboardingChoice }
  | { kind: "rejected"; message: string }

/** Present only when ASSISTANT_WHATSAPP_ADD_BUSINESS_ENABLED=1. */
export type WhatsAppAddBusinessAdapter = {
  /** Fresh server-derived account and current consented scope for this sender. */
  account: () => Promise<WhatsAppAddBusinessAccount | null>
  /** Recheck fresh email proof and the linked sender, then run the canonical create command. */
  create: (input: {
    userId: string
    sessionId: string
    business: WhatsAppAddBusinessComplete
    operationId: string
  }) => Promise<WhatsAppAddBusinessCreateResult>
}

type Field = Exclude<keyof WhatsAppAddBusinessDraft, "phone">

const lifetimeMs = 30 * 60_000
const proofWindowMs = 10 * 60_000
const maxAttempts = 5
/** Same short list as the design's Country and currency picker. */
const marketChoices = [
  ["NG", "NGN"],
  ["GH", "GHS"],
  ["KE", "KES"],
  ["ZA", "ZAR"],
  ["EG", "EGP"],
] as const
const marketList = `${marketChoices
  .map(([code, currency]) => `${findCountry(code)?.name} · ${currency}`)
  .join(", ")} or Other · USD`

export const whatsAppAddBusinessCommands = {
  create: "CREATE BUSINESS",
  edit: "EDIT",
  cancel: "CANCEL",
  resend: "RESEND",
  switch: "SWITCH",
  stay: "STAY",
} as const

const hasControl = (value: string) =>
  [...value].some(
    (point) => (point.codePointAt(0) ?? 0) < 32 || point.codePointAt(0) === 127,
  )
const label = (value: string) =>
  [...value]
    .map((point) => (hasControl(point) ? " " : point))
    .join("")
    .replace(/[*_~`]/g, " ")
    .trim()
    .slice(0, 120)

/**
 * Explicit add-business intents only. Returns the supplied business name, if
 * any, so “add another business called Ada Kitchen” skips that question.
 */
export function whatsAppAddBusinessEntry(
  text: string,
): { businessName?: string } | null {
  const match =
    /^(?:i\s+(?:want|would like|need)\s+to\s+)?(?:add|create|start|open)\s+(?:a\s+new\s+|another\s+|a\s+|new\s+)?business(?:\s+(?:called|named)\s+(.+?))?[.!]?$/i.exec(
      text.trim(),
    )
  if (!match) return null
  const businessName = match[1]?.trim()
  return businessName &&
    businessName.length <= 120 &&
    !hasControl(businessName) &&
    !/[*_~`]/.test(businessName)
    ? { businessName }
    : {}
}

function country(value: string) {
  const normalized = value.trim().toLowerCase()
  return COUNTRIES.find(
    (entry) =>
      entry.code.toLowerCase() === normalized ||
      entry.name.toLowerCase() === normalized,
  )?.code
}

/** “Nigeria · NGN”, “NG NGN”, “Nigeria” (its own currency) or “Other · USD”. */
function market(
  value: string,
): Pick<WhatsAppAddBusinessDraft, "countryCode" | "currencyCode"> | null {
  const trimmed = value.trim()
  const pair = /^(.+?)\s*(?:·|-|–|\/|\s)\s*([A-Za-z]{3})$/.exec(trimmed)
  if (pair?.[1] && pair[2]) {
    const currency = pair[2].toUpperCase()
    if (!isOperatingCurrencyCode(currency)) return null
    if (/^other$/i.test(pair[1].trim()))
      return currency === "USD"
        ? { countryCode: null, currencyCode: currency }
        : null
    const code = country(pair[1])
    return code ? { countryCode: code, currencyCode: currency } : null
  }
  if (/^other$/i.test(trimmed))
    return { countryCode: null, currencyCode: "USD" }
  const code = country(trimmed)
  const currency = code ? currencyForCountry(code) : null
  return code && currency ? { countryCode: code, currencyCode: currency } : null
}

function text(value: string, max: number) {
  const trimmed = value.trim()
  return trimmed && trimmed.length <= max && !hasControl(trimmed)
    ? trimmed
    : undefined
}

function phone(value: string) {
  const trimmed = value.trim()
  return /^\+?[\d\s()-]{7,40}$/.test(trimmed) &&
    (trimmed.match(/\d/g)?.length ?? 0) >= 7
    ? trimmed
    : undefined
}

const fieldPattern =
  "(?:business|company)(?: name)?|name|country(?: and currency| · currency)?|currency|(?:street )?address|location|city|town|(?:store |support )?phone"

/** Deterministic collector; credentials and codes are never accepted as details. */
export function collectWhatsAppAddBusinessDetails(
  input: string,
  fallback?: Field,
) {
  const patch: WhatsAppAddBusinessDraft = {}
  const invalid: string[] = []
  if (
    input.length > 4096 ||
    /^\d{6}$/.test(input.trim()) ||
    /\b(?:password|passcode|otp|verification\s+code)\b/i.test(input)
  )
    return { patch, invalid, sensitive: true }
  const parts = input.split(
    new RegExp(`\\r?\\n|;|,(?=\\s*(?:${fieldPattern})\\s*(?::|=| is\\b))`, "i"),
  )
  let labeled = false
  for (const part of parts) {
    const match = new RegExp(
      `^\\s*(?:\\d+[.)]\\s*)?(${fieldPattern})\\s*(?::|=| is\\b)\\s*(.*?)\\s*$`,
      "i",
    ).exec(part)
    if (!match?.[1] || match[2] === undefined) {
      // A short-list line such as “Nigeria · NGN” may sit beside labeled lines.
      const chosen = parts.length > 1 ? market(part) : null
      if (chosen) {
        Object.assign(patch, chosen)
        labeled = true
      }
      continue
    }
    labeled = true
    const key = match[1].toLowerCase()
    const value = match[2]
    if (/business|company|^name$/.test(key)) {
      const name = text(value, 120)
      if (name) patch.businessName = name
      else invalid.push("Business name")
    } else if (/country/.test(key)) {
      const chosen = market(value)
      if (chosen) Object.assign(patch, chosen)
      else invalid.push("Country · currency")
    } else if (/currency/.test(key)) {
      const currency = value.trim().toUpperCase()
      if (isOperatingCurrencyCode(currency)) patch.currencyCode = currency
      else invalid.push("Currency")
    } else if (/address|location/.test(key)) {
      const address = text(value, 200)
      if (address) patch.addressLine1 = address
      else invalid.push("Street address")
    } else if (/city|town/.test(key)) {
      const city = text(value, 120)
      if (city) patch.city = city
      else invalid.push("City")
    } else {
      const number = phone(value)
      if (number) patch.phone = number
      else invalid.push("Store phone")
    }
  }
  if (!labeled) {
    const trimmed = input.trim()
    const tuple = trimmed.split(/\s*,\s*/)
    const chosen = market(trimmed)
    const tupleMarket = tuple.length === 4 ? market(tuple[1] ?? "") : null
    if (chosen) Object.assign(patch, chosen)
    else if (tupleMarket) {
      const [name, , address, city] = tuple.map((value) => text(value, 200))
      if (name && name.length <= 120) patch.businessName = name
      else invalid.push("Business name")
      Object.assign(patch, tupleMarket)
      if (address) patch.addressLine1 = address
      else invalid.push("Street address")
      if (city && city.length <= 120) patch.city = city
      else invalid.push("City")
    } else if (fallback && fallback !== "countryCode") {
      // A lone answer fills the single open question; it never overwrites a field.
      const value =
        fallback === "currencyCode"
          ? isOperatingCurrencyCode(trimmed.toUpperCase())
            ? trimmed.toUpperCase()
            : undefined
          : text(trimmed, fallback === "addressLine1" ? 200 : 120)
      if (value)
        Object.assign(patch, {
          [fallback]: value,
        } satisfies WhatsAppAddBusinessDraft)
    }
  }
  return { patch, invalid, sensitive: false }
}

const prompts: Record<Field, string> = {
  businessName: "Business name",
  countryCode: `Country · currency: ${marketList}`,
  currencyCode: "Currency: NGN, GHS, KES, ZAR, EGP or USD",
  addressLine1: "Street address of its Main Store",
  city: "City",
}

function missing(draft: WhatsAppAddBusinessDraft): Field[] {
  const fields: Field[] = []
  if (!draft.businessName) fields.push("businessName")
  if (draft.countryCode === undefined) fields.push("countryCode")
  else if (!draft.currencyCode) fields.push("currencyCode")
  if (!draft.addressLine1) fields.push("addressLine1")
  if (!draft.city) fields.push("city")
  return fields
}

function complete(
  draft: WhatsAppAddBusinessDraft | undefined,
): WhatsAppAddBusinessComplete | undefined {
  if (
    !draft?.businessName ||
    draft.countryCode === undefined ||
    !draft.currencyCode ||
    !draft.addressLine1 ||
    !draft.city ||
    !draft.phone
  )
    return undefined
  return {
    businessName: draft.businessName,
    countryCode: draft.countryCode,
    currencyCode: draft.currencyCode,
    addressLine1: draft.addressLine1,
    city: draft.city,
    phone: draft.phone,
  }
}

function currentLabel(state: WhatsAppOnboardingState) {
  const current = state.current
  return current
    ? `*${label(current.businessName)}* · ${label(current.storeName)}`
    : "your current business"
}

function detailsPrompt(state: WhatsAppOnboardingState, invalid: string[] = []) {
  const draft = state.business ?? {}
  const open = missing(draft)
  const list = open
    .map((field, index) => `${index + 1}. ${prompts[field]}`)
    .join("\n")
  const intro = draft.businessName
    ? `🏪 Where does *${label(draft.businessName)}* trade? Send these together:`
    : "🏪 Add a business under this same account. Send these together:"
  const example = draft.businessName
    ? "For example: “Nigeria · NGN, Address: 12 Allen Avenue, City: Ikeja”."
    : "For example: “Ada Kitchen, Nigeria · NGN, 12 Allen Avenue, Ikeja”."
  return `${invalid.length ? `Please correct: ${invalid.join(", ")}.\n` : ""}${intro}\n${list}\n${example} Nothing is created until you review and confirm. Reply CANCEL to stop.`
}

function marketLabel(draft: WhatsAppAddBusinessComplete) {
  return draft.countryCode
    ? `${findCountry(draft.countryCode)?.name ?? draft.countryCode} · ${draft.currencyCode}`
    : `Other country · ${draft.currencyCode}`
}

function review(
  state: WhatsAppOnboardingState,
  draft: WhatsAppAddBusinessComplete,
) {
  const owner = state.current?.ownerName
    ? `${label(state.current.ownerName)} (you)`
    : "You"
  const sameAccount = state.current
    ? `Same account and email as *${label(state.current.businessName)}*.`
    : "Same account and email you use here."
  return `🧾 Review new business\n*${label(draft.businessName)}*\n${marketLabel(draft)}\nAddress: ${label(draft.addressLine1)}, ${label(draft.city)}\nStore phone: ${label(draft.phone)}${draft.phone === `+${state.senderId}` ? " (this WhatsApp number)" : ""}\nOwner: ${owner}\nStarts with: Main Store\n\n${sameAccount} We will email you a code to confirm it’s you.\n_Nothing is created until you confirm._ Send corrections like “City: Lagos”.`
}

const maskEmail = (email: string) => {
  const [local = "", domain = ""] = email.split("@")
  return `${local.slice(0, 1)}•••@${domain}`
}

export function whatsAppAddBusinessButtons(
  state: WhatsAppOnboardingState,
): WhatsAppOnboardingButton[] {
  const commands = whatsAppAddBusinessCommands
  switch (state.stage) {
    case "add_review":
      return [
        { command: commands.create, title: "Create business" },
        { command: commands.edit, title: "Edit" },
        { command: commands.cancel, title: "Cancel" },
      ]
    case "add_code":
      return [
        { command: commands.resend, title: "Resend code" },
        { command: commands.cancel, title: "Cancel" },
      ]
    case "add_created":
      return [
        { command: commands.switch, title: "Switch to it" },
        { command: commands.stay, title: "Stay here" },
      ]
    default:
      return [{ command: commands.cancel, title: "Cancel" }]
  }
}

/** Control words are never stored as a business detail. */
const reservedReplies = new Set([
  "CREATE",
  "CREATE BUSINESS",
  "EDIT",
  "SWITCH",
  "SWITCH TO IT",
  "STAY",
  "STAY HERE",
  "RESEND",
  "YES",
  "NO",
  "HELP",
  "MENU",
  "KEEP",
  "CONTINUE",
])

/** A stale signed add-business tap is consumed without any effect. */
export const whatsAppAddBusinessExpiredReply =
  "That choice expired. Nothing was changed."

export function isWhatsAppAddBusinessCommand(command: string) {
  return (
    command === whatsAppAddBusinessCommands.create ||
    command === whatsAppAddBusinessCommands.switch ||
    command === whatsAppAddBusinessCommands.stay
  )
}

/**
 * Called by the onboarding state machine for a linked sender. `previous` is an
 * add-business state or null (fresh entry). The caller has already validated the
 * address and duplicate delivery.
 */
export async function advanceWhatsAppAddBusiness(
  previous: WhatsAppOnboardingState | null,
  message: WhatsAppOnboardingMessage,
  entry: { businessName?: string } | null,
  adapters: WhatsAppOnboardingAdapters,
  appPointer: () => WhatsAppOnboardingResult,
): Promise<WhatsAppOnboardingResult> {
  const result = (
    state: WhatsAppOnboardingState | null,
    reply: string,
    connected = false,
    buttons?: WhatsAppOnboardingButton[],
  ): WhatsAppOnboardingResult => ({
    state: state
      ? { ...state, lastMessageId: message.messageId, lastReply: reply }
      : null,
    reply,
    connected,
    buttons: buttons ?? (state ? whatsAppAddBusinessButtons(state) : []),
  })
  const add = adapters.addBusiness
  // Flag off mid-flow, or no live link: nothing is created; the app path stays.
  if (!add || !(adapters.connected || adapters.connectedChoice))
    return appPointer()
  const input = message.text.trim()
  const command = input.toUpperCase().replace(/\s+/g, " ")
  const stopped = (state: WhatsAppOnboardingState) =>
    result(
      null,
      `❌ No business was created. You’re still in ${currentLabel(state)}.`,
    )

  // Entry phrases (including "Create business") never restart an open request.
  if (!previous) {
    const account = await add.account()
    if (
      !account ||
      (adapters.connectedUserId && adapters.connectedUserId !== account.userId)
    )
      return appPointer()
    const state: WhatsAppOnboardingState = {
      version: 1,
      phoneNumberId: message.phoneNumberId,
      senderId: message.senderId,
      stage: "add_details",
      mode: "add_business",
      expiresAt: message.now + lifetimeMs,
      attempts: 0,
      current: {
        businessName: account.businessName,
        storeName: account.storeName,
        ...(account.ownerName ? { ownerName: account.ownerName } : {}),
      },
      business: {
        phone: `+${message.senderId}`,
        ...(entry?.businessName ? { businessName: entry.businessName } : {}),
      },
    }
    return result(state, detailsPrompt(state))
  }

  if (previous.expiresAt <= message.now)
    return result(
      null,
      "This Add business request expired. Nothing was created. Send ADD BUSINESS to start again.",
    )
  let state = previous
  if (
    command === "CANCEL" ||
    command === "STOP" ||
    (state.stage === "add_review" && command === "NO")
  ) {
    if (state.stage === "add_created")
      return result(
        null,
        `👍 You’re still in ${currentLabel(state)}. *${label(state.created?.businessName ?? "Your new business")}* is in your account — send CONNECT any time to use it here.`,
      )
    return stopped(state)
  }

  switch (state.stage) {
    case "add_details":
    case "add_review": {
      if (state.stage === "add_review") {
        if (
          command === whatsAppAddBusinessCommands.create ||
          command === "CREATE"
        ) {
          const draft = complete(state.business)
          if (!draft)
            return result(
              { ...state, stage: "add_details" },
              detailsPrompt(state),
            )
          const account = await add.account()
          if (
            !account ||
            (adapters.connectedUserId &&
              adapters.connectedUserId !== account.userId)
          )
            return stopped(state)
          return requestCode({ ...state, email: account.email.toLowerCase() })
        }
        if (command === whatsAppAddBusinessCommands.edit)
          return result(
            { ...state, stage: "add_details" },
            "✏️ What should change? Send only that, for example “City: Lagos”, “Name: Ada Kitchen” or “Ghana · GHS”. Nothing is created until you review again. Reply CANCEL to stop.",
          )
      }
      const open = missing(state.business ?? {})
      const collected = collectWhatsAppAddBusinessDetails(
        input,
        open.length === 1 && !reservedReplies.has(command)
          ? open[0]
          : undefined,
      )
      if (collected.sensitive)
        return result(
          state,
          `Never send a password or verification code as business details. ${detailsPrompt(state)}`,
        )
      const business = { ...state.business, ...collected.patch }
      state = { ...state, business }
      const draft = complete(business)
      if (!draft || collected.invalid.length)
        return result(
          { ...state, stage: "add_details" },
          detailsPrompt(state, collected.invalid),
        )
      // Each new review rotates the signed prompt, so earlier Create taps expire.
      return result({ ...state, stage: "add_review" }, review(state, draft))
    }
    case "add_code": {
      if (command === "RESEND") return requestCode(state)
      const code = input.replace(/^(\d{3})\s(\d{3})$/, "$1$2")
      if (!/^\d{6}$/.test(code))
        return result(
          state,
          "Send only the six-digit code from your email, or reply RESEND. Nothing is created until you do. Never send your password.",
        )
      if (!state.challengeExpiresAt || state.challengeExpiresAt <= message.now)
        return result(
          state,
          "That code has expired. Reply RESEND for a new email code.",
        )
      const draft = complete(state.business)
      if (!draft || !state.email) return stopped(state)
      if (state.attempts >= maxAttempts)
        return result(
          null,
          "Too many verification attempts. Nothing was created. Send ADD BUSINESS later to try again.",
        )
      let principal: { userId: string; sessionId: string } | null = null
      try {
        principal = await adapters.verifyEmail({
          phoneNumberId: message.phoneNumberId,
          senderId: message.senderId,
          email: state.email,
          mode: "login",
          code,
          operationId: message.messageId,
        })
      } catch {
        // Proof failures never disclose account details or reach the model.
      }
      if (!principal)
        return state.attempts + 1 >= maxAttempts
          ? result(
              null,
              "Too many verification attempts. Nothing was created. Send ADD BUSINESS later to try again.",
            )
          : result(
              { ...state, attempts: state.attempts + 1 },
              "We could not verify that code. Check the email and try again, or reply RESEND. Nothing was created.",
            )
      // The proof must belong to the account this number is linked to.
      if (
        !adapters.connectedUserId ||
        principal.userId !== adapters.connectedUserId
      )
        return stopped(state)
      let created: WhatsAppAddBusinessCreateResult
      try {
        created = await add.create({
          userId: principal.userId,
          sessionId: principal.sessionId,
          business: draft,
          operationId: message.messageId,
        })
      } catch {
        created = {
          kind: "rejected",
          message:
            "We could not create the business. Nothing was changed. Try again later, or add it in the EwaTrade app.",
        }
      }
      if (created.kind === "rejected") return result(null, created.message)
      const next: WhatsAppOnboardingState = {
        ...state,
        stage: "add_created",
        principal,
        created: created.choice,
        challengeExpiresAt: undefined,
        email: undefined,
        expiresAt: Math.min(state.expiresAt, message.now + proofWindowMs),
      }
      return result(
        next,
        `✅ *${label(created.choice.businessName)}* created, with ${label(created.choice.storeName)}. You’re the Owner.\n\nSwitch to it now? ${state.current ? `*${label(state.current.businessName)}*` : "Your current business"} stays connected.`,
      )
    }
    case "add_created": {
      const created = state.created
      if (
        command === whatsAppAddBusinessCommands.stay ||
        command === "STAY HERE"
      )
        return result(
          null,
          `👍 You’re still in ${currentLabel(state)}. *${label(created?.businessName ?? "Your new business")}* is in your account — send CONNECT any time to use it here.`,
        )
      if (
        command !== whatsAppAddBusinessCommands.switch &&
        command !== "SWITCH TO IT"
      )
        return result(
          state,
          `Switch to *${label(created?.businessName ?? "your new business")}* now, or stay in ${currentLabel(state)}?`,
        )
      if (!created || !state.principal) return appPointer()
      try {
        // Canonical link authority: consents and selects the exact new business/Store.
        await adapters.connect({
          phoneNumberId: message.phoneNumberId,
          senderId: message.senderId,
          userId: state.principal.userId,
          sessionId: state.principal.sessionId,
          choice: created,
          operationId: message.messageId,
        })
      } catch {
        return result(
          null,
          `*${label(created.businessName)}* is ready in your account, but this chat could not switch to it. Send CONNECT to verify and use it here. You’re still in ${currentLabel(state)}.`,
        )
      }
      return result(
        null,
        `✅ Now in *${label(created.businessName)}* · ${label(created.storeName)}.\nAdd your first products, or ask anything.`,
        true,
        [{ command: "HELP", title: "What can I ask?" }],
      )
    }
    default:
      return stopped(state)
  }

  async function requestCode(
    current: WhatsAppOnboardingState,
  ): Promise<WhatsAppOnboardingResult> {
    if (!current.email) return stopped(current)
    if (current.requestedAt && message.now - current.requestedAt < 60_000)
      return result(
        { ...current, stage: "add_code" },
        "Wait one minute before requesting another code.",
      )
    try {
      const issued = await adapters.requestEmail({
        phoneNumberId: message.phoneNumberId,
        senderId: message.senderId,
        email: current.email,
        mode: "login",
        operationId: message.messageId,
      })
      return result(
        {
          ...current,
          stage: "add_code",
          requestedAt: message.now,
          challengeExpiresAt: issued.expiresAt.getTime(),
        },
        `🔐 Confirm it’s you to create *${label(current.business?.businessName ?? "your business")}*. We emailed a six-digit code to ${maskEmail(current.email)}. Send it here. Never send your password.`,
      )
    } catch {
      return result(
        { ...current, stage: "add_code", requestedAt: message.now },
        "We could not send the verification email. Wait one minute, then reply RESEND. Nothing was created.",
      )
    }
  }
}
