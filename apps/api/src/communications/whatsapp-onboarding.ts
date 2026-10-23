import { findCountry } from "@ewatrade/utils/countries"
import type { OperatingCurrencyCode } from "@ewatrade/utils/currency"
import { isOperatingCurrencyCode } from "@ewatrade/utils/currency"
import {
  collectWhatsAppRegistrationDetails,
  whatsAppRegistrationEntry,
  whatsAppRegistrationFields,
  whatsAppRegistrationMissing,
} from "./whatsapp-onboarding-details"

export type WhatsAppOnboardingAddress = {
  phoneNumberId: string
  senderId: string
}

export type WhatsAppOnboardingSignup = {
  name: string
  businessName: string
  ageBand: "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"
  countryCode: string
  currencyCode: OperatingCurrencyCode
  legalVersion: string
  acceptedTerms: true
  acknowledgedPrivacyNotice: true
}

export type WhatsAppOnboardingChoice = {
  tenantId: string
  storeId: string
  membershipId: string
  businessName: string
  storeName: string
}

export type WhatsAppOnboardingPrincipal = {
  userId: string
  sessionId: string
}

type Stage =
  | "email"
  | "name"
  | "business"
  | "age"
  | "location"
  | "legal"
  | "code"
  | "choose"
  | "consent"
  | "complete"

/** Server-only state. Never persist a code, password, session token or raw inbound body. */
export type WhatsAppOnboardingState = WhatsAppOnboardingAddress & {
  version: 1
  stage: Stage
  mode: "login" | "sign_up"
  expiresAt: number
  attempts: number
  requestedAt?: number
  challengeExpiresAt?: number
  email?: string
  signup?: Partial<WhatsAppOnboardingSignup>
  principal?: WhatsAppOnboardingPrincipal
  choices?: WhatsAppOnboardingChoice[]
  page?: number
  selected?: WhatsAppOnboardingChoice
  lastMessageId?: string
  lastReply?: string
}

export type WhatsAppOnboardingMessage = WhatsAppOnboardingAddress & {
  messageId: string
  text: string
  now: number
  /** Validated native Flow data, never a fabricated sequence of chat messages. */
  signupForm?: WhatsAppOnboardingSignup & { email: string }
}

export type WhatsAppOnboardingButton = { command: string; title: string }

export type WhatsAppOnboardingResult = {
  state: WhatsAppOnboardingState | null
  reply: string
  connected: boolean
  buttons?: WhatsAppOnboardingButton[]
}

export type WhatsAppOnboardingAdapters = {
  legal: { version: string; termsUrl: string; privacyUrl: string } | null
  /** Fresh server-derived connection; never supplied by the sender or native form. */
  connectedChoice?: WhatsAppOnboardingChoice | null
  connected?: boolean
  connectedUserId?: string
  accountUrl?: string
  requestEmail: (
    input: WhatsAppOnboardingAddress & {
      email: string
      mode: "login" | "sign_up"
      signup?: WhatsAppOnboardingSignup
      operationId: string
    },
  ) => Promise<{ expiresAt: Date }>
  verifyEmail: (
    input: WhatsAppOnboardingAddress & {
      email: string
      mode: "login" | "sign_up"
      signup?: WhatsAppOnboardingSignup
      code: string
      operationId: string
    },
  ) => Promise<WhatsAppOnboardingPrincipal | null>
  choices: (
    principal: WhatsAppOnboardingPrincipal,
  ) => Promise<WhatsAppOnboardingChoice[]>
  /** Recheck the fresh real session, current membership and exact Store; commit through the canonical link authority. */
  connect: (
    input: WhatsAppOnboardingAddress &
      WhatsAppOnboardingPrincipal & {
        choice: WhatsAppOnboardingChoice
        operationId: string
      },
  ) => Promise<void>
}

const lifetimeMs = 30 * 60_000
const pageSize = 2
const maxAttempts = 5
const greeting =
  "Welcome to EwaTrade. Connect your account with email verification, or create an account here. Reply CONNECT or send your account email; reply REGISTER if you are new. Never send a password. Reply CANCEL at any time."
const genericCodePrompt =
  "Check your email for a six-digit EwaTrade verification code and send it here. If you need a new account, reply REGISTER. Never send your password. Reply RESEND after one minute if needed."

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

function result(
  state: WhatsAppOnboardingState | null,
  message: WhatsAppOnboardingMessage,
  reply: string,
  connected = false,
  buttons?: WhatsAppOnboardingButton[],
): WhatsAppOnboardingResult {
  return {
    state: state
      ? { ...state, lastMessageId: message.messageId, lastReply: reply }
      : null,
    reply,
    connected,
    buttons: buttons ?? whatsAppOnboardingButtons(state),
  }
}

/** Button commands remain usable as plain text; the runtime signs the native IDs. */
export function whatsAppOnboardingButtons(
  state: WhatsAppOnboardingState | null,
): WhatsAppOnboardingButton[] {
  const cancel = { command: "CANCEL", title: "Cancel" }
  if (!state)
    return [
      { command: "CONNECT", title: "Connect account" },
      { command: "REGISTER", title: "Create account" },
    ]
  switch (state.stage) {
    case "age":
      return [
        { command: "3", title: "18 or older" },
        { command: "2", title: "16–17" },
        { command: "1", title: "13–15" },
      ]
    case "legal":
      return [
        { command: "YES", title: "I agree" },
        { command: "NO", title: "Cancel" },
      ]
    case "code":
      return [
        { command: "RESEND", title: "Resend code" },
        { command: "CHANGE EMAIL", title: "Change email" },
        cancel,
      ]
    case "consent":
      return [
        { command: "YES", title: "Yes, connect" },
        { command: "NO", title: "Not now" },
      ]
    case "complete":
      return [
        { command: "MENU", title: "Menu" },
        { command: "HELP", title: "What can I ask?" },
      ]
    case "choose": {
      const offset = (state.page ?? 0) * pageSize
      const choices = (state.choices ?? [])
        .slice(offset, offset + pageSize)
        .map((choice, index) => ({
          command: String(offset + index + 1),
          title: Array.from(
            `${label(choice.businessName)} · ${label(choice.storeName)}`,
          )
            .slice(0, 20)
            .join(""),
        }))
      const more = offset + pageSize < (state.choices?.length ?? 0)
      return [
        ...choices,
        more
          ? { command: "NEXT", title: "More choices" }
          : offset > 0
            ? { command: "BACK", title: "Previous choices" }
            : cancel,
      ]
    }
    default:
      return [cancel]
  }
}

function connectedReply(
  message: WhatsAppOnboardingMessage,
  adapters: WhatsAppOnboardingAdapters,
  addBusiness = false,
) {
  const scope = adapters.connectedChoice
  const description = scope
    ? `${label(scope.businessName)} — ${label(scope.storeName)}`
    : "your existing account"
  const reply = addBusiness
    ? `A new business goes under your same account — no new sign-up. You will be its Owner, with its own Main Store. Open the EwaTrade app → switch business → Add business${adapters.accountUrl ? `: ${adapters.accountUrl}` : ""}, then send CONNECT to use it here. Nothing was created here.`
    : `You are already connected to ${description}. You do not need a new account. To start another business under the same account, reply ADD BUSINESS. To connect another existing business, reply CONNECT. Or keep chatting.`
  return result(null, message, reply, false, [
    { command: "KEEP", title: "Keep chatting" },
    { command: "ADD BUSINESS", title: "Add a business" },
    { command: "CONNECT", title: "Connect business" },
  ])
}

function chooseReply(state: WhatsAppOnboardingState) {
  const choices = state.choices ?? []
  const offset = (state.page ?? 0) * pageSize
  const lines = choices
    .slice(offset, offset + pageSize)
    .map(
      (choice, index) =>
        `${offset + index + 1}. ${label(choice.businessName)} — ${label(choice.storeName)}`,
    )
  return `Email verified. Choose the business and Store to connect:\n${lines.join("\n")}\nReply with its number.${offset + pageSize < choices.length ? " Reply NEXT for more." : ""}${offset > 0 ? " Reply BACK for the previous page." : ""}`
}

function consentReply(choice: WhatsAppOnboardingChoice) {
  return `Connect this WhatsApp number to ${label(choice.businessName)} — ${label(choice.storeName)}? Reply YES to allow access using your current business permissions, or NO to cancel.`
}

export function whatsAppOnboardingWelcome(choice: WhatsAppOnboardingChoice) {
  return `You are connected to ${label(choice.businessName)} — ${label(choice.storeName)}.\nTry “Help”, “Show my sales” or “Check stock”. Nothing is saved until you confirm. Actions use your current app permissions. Access lasts 30 days, or 7 days if unused. Send DISCONNECT to remove this WhatsApp connection.`
}

function completeSignup(
  value: Partial<WhatsAppOnboardingSignup> | undefined,
): WhatsAppOnboardingSignup | undefined {
  if (
    !value?.name ||
    !value.businessName ||
    !value.ageBand ||
    !value.countryCode ||
    !value.currencyCode ||
    !value.legalVersion ||
    value.acceptedTerms !== true ||
    value.acknowledgedPrivacyNotice !== true
  )
    return undefined
  return {
    name: value.name,
    businessName: value.businessName,
    ageBand: value.ageBand,
    countryCode: value.countryCode,
    currencyCode: value.currencyCode,
    legalVersion: value.legalVersion,
    acceptedTerms: true,
    acknowledgedPrivacyNotice: true,
  }
}

function registrationPrompt(state: WhatsAppOnboardingState) {
  const missing = whatsAppRegistrationMissing({
    ...state.signup,
    email: state.email,
  })
  const list = missing
    .map((field, index) => `${index + 1}. ${whatsAppRegistrationFields[field]}`)
    .join("\n")
  if (state.email || Object.values(state.signup ?? {}).some(Boolean))
    return `Your unfinished registration is saved. Send only these missing or corrected details together:\n${list}\nUse field labels; you can send several messages. Never send a password. Reply CANCEL to stop.`
  return `Let’s set up your EwaTrade account. Send these details together:\n${list}\nUse labels, or write: “Ishaq Stores, Ishaq Yusuf, owner@example.com, Nigeria, NGN, 18+”. You can answer in several messages. Nothing is created before your review, Terms consent and email verification. Never send a password. Reply CANCEL to stop.`
}

function registrationReview(
  state: WhatsAppOnboardingState,
  legal: NonNullable<WhatsAppOnboardingAdapters["legal"]>,
) {
  return `Review your account:\nBusiness: ${label(state.signup?.businessName ?? "")}\nName: ${label(state.signup?.name ?? "")}\nEmail: ${label(state.email ?? "")}\nAge group: ${state.signup?.ageBand === "ADULT" ? "18+" : state.signup?.ageBand === "AGE_16_TO_17" ? "16–17" : "13–15"}\nCountry/currency: ${state.signup?.countryCode} ${state.signup?.currencyCode}\nTerms: ${legal.termsUrl}\nPrivacy Notice: ${legal.privacyUrl}\nReply YES to accept the Terms, acknowledge the Privacy Notice and receive an email verification code. Send labeled corrections together, or NO to cancel. Nothing is created before email verification.`
}

/**
 * Deterministic connection dialogue, ahead of ordinary assistant ingress.
 * The runtime must durably claim each sender/provider-message ID and serialize this
 * sender's transitions before calling. Adapters own purpose/sender-bound OTPs,
 * expiry/rate limits and idempotent canonical writes; no provider I/O in DB transactions.
 * Only this explicit code stage interprets six digits as a verification code.
 */
export async function advanceWhatsAppOnboarding(
  previous: WhatsAppOnboardingState | null,
  message: WhatsAppOnboardingMessage,
  adapters: WhatsAppOnboardingAdapters,
): Promise<WhatsAppOnboardingResult> {
  if (
    !/^\d+$/.test(message.phoneNumberId) ||
    !/^[1-9]\d{7,14}$/.test(message.senderId) ||
    !message.messageId ||
    message.messageId.length > 256 ||
    !Number.isFinite(message.now)
  )
    throw new Error("Invalid WhatsApp onboarding address.")
  if (
    previous &&
    (previous.senderId !== message.senderId ||
      previous.phoneNumberId !== message.phoneNumberId)
  )
    throw new Error("WhatsApp onboarding sender changed.")
  if (previous?.lastMessageId === message.messageId)
    return {
      state: previous,
      reply: previous.lastReply ?? "",
      connected: previous.stage === "complete",
    }
  const originalText = message.text.trim()
  const entry = whatsAppRegistrationEntry(originalText)
  const text = entry || originalText
  const rawCommand = text.toUpperCase()
  const command = entry !== null ? "REGISTER" : rawCommand
  // A linked identity cannot reach new-account registration through a later restart or form.
  if (
    (adapters.connected || adapters.connectedChoice) &&
    (message.signupForm ||
      previous?.mode === "sign_up" ||
      /^(?:REGISTER|CREATE ACCOUNT|START OVER|ADD BUSINESS|I WANT TO ADD ANOTHER BUSINESS)$/.test(
        command,
      ))
  )
    return connectedReply(message, adapters, /ADD.*BUSINESS/.test(command))
  if (
    (adapters.connected || adapters.connectedChoice) &&
    /^(?:KEEP|HELP|MENU)$/.test(command)
  )
    return result(
      null,
      message,
      "Go ahead — what do you need? Try asking about sales or stock. Nothing is saved until you confirm. Reply ADD BUSINESS to create another business in the app, CONNECT to verify another existing business, or DISCONNECT to remove WhatsApp access.",
      false,
      [{ command: "HELP", title: "What can I ask?" }],
    )
  if (/^(?:CANCEL|STOP|UNSUBSCRIBE|DISCONNECT(?: EWATRADE)?)$/.test(command))
    return result(
      null,
      message,
      "Connection cancelled. Send CONNECT whenever you are ready.",
    )
  if (previous && previous.expiresAt <= message.now)
    return result(
      null,
      message,
      "This verification session expired. Send CONNECT or REGISTER to start again.",
    )
  if (previous && previous.attempts >= maxAttempts)
    return result(
      previous,
      message,
      "Too many verification attempts. Wait until this session expires before starting again.",
    )
  let state: WhatsAppOnboardingState = previous ?? {
    version: 1,
    phoneNumberId: message.phoneNumberId,
    senderId: message.senderId,
    stage: "email",
    mode: "login",
    expiresAt: message.now + lifetimeMs,
    attempts: 0,
  }
  if (command === "REGISTER" || command === "CONNECT") {
    if (command === "REGISTER" && previous?.mode === "sign_up")
      return result(
        state,
        message,
        state.stage === "code"
          ? genericCodePrompt
          : state.stage === "consent" && state.selected
            ? consentReply(state.selected)
            : state.stage === "choose"
              ? chooseReply(state)
              : state.stage === "legal" && adapters.legal
                ? registrationReview(state, adapters.legal)
                : registrationPrompt(state),
      )
    state = {
      version: 1,
      phoneNumberId: message.phoneNumberId,
      senderId: message.senderId,
      stage: command === "REGISTER" ? "name" : "email",
      mode: command === "REGISTER" ? "sign_up" : "login",
      expiresAt: state.expiresAt,
      attempts: state.attempts,
      requestedAt: state.requestedAt,
    }
    if (!entry)
      return result(
        state,
        message,
        command === "REGISTER" ? registrationPrompt(state) : greeting,
      )
  }
  const requestCode = async () => {
    if (!state.email) return result(null, message, greeting)
    if (state.requestedAt && message.now - state.requestedAt < 60_000)
      return result(
        state,
        message,
        "Wait one minute before requesting another code.",
      )
    const signup = completeSignup(state.signup)
    if (state.mode === "sign_up" && !signup)
      return result(
        null,
        message,
        "Registration details changed. Send REGISTER to begin again.",
      )
    try {
      const issued = await adapters.requestEmail({
        phoneNumberId: message.phoneNumberId,
        senderId: message.senderId,
        email: state.email,
        mode: state.mode,
        ...(signup ? { signup } : {}),
        operationId: message.messageId,
      })
      return result(
        {
          ...state,
          stage: "code",
          requestedAt: message.now,
          challengeExpiresAt: issued.expiresAt.getTime(),
        },
        message,
        genericCodePrompt,
      )
    } catch {
      return result(
        { ...state, requestedAt: message.now },
        message,
        "We could not send the verification email. Wait one minute, then reply RESEND. You can also reply CANCEL.",
      )
    }
  }
  if (message.signupForm) {
    const form = message.signupForm
    const signup = completeSignup(form)
    if (
      !signup ||
      !adapters.legal ||
      adapters.legal.version !== signup.legalVersion ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ||
      form.email.length > 254 ||
      !findCountry(signup.countryCode) ||
      !isOperatingCurrencyCode(signup.currencyCode) ||
      !["AGE_13_TO_15", "AGE_16_TO_17", "ADULT"].includes(signup.ageBand) ||
      [signup.name, signup.businessName].some(
        (value) => !value.trim() || value.length > 120 || hasControl(value),
      )
    )
      return result(
        null,
        message,
        "Registration details or legal documents changed. Send REGISTER to review them again. Nothing was created.",
      )
    if (state.stage === "code" && state.mode === "sign_up")
      return result(
        state,
        message,
        "A verification code is already pending. Send the six digits from your email, or reply RESEND or CANCEL.",
      )
    state = {
      ...state,
      stage: "legal",
      mode: "sign_up",
      email: form.email.trim().toLowerCase(),
      signup,
    }
    return requestCode()
  }
  if (
    state.stage === "code" &&
    /(?:DIDN.T|DID NOT|DIDNT|NOT RECEIVE|NO EMAIL|NOTHING ARRIVED|CAN.T FIND)/.test(
      command,
    )
  )
    return result(
      state,
      message,
      "Check your inbox and spam or junk folder. Confirm the email address you entered. Reply RESEND after one minute, CHANGE EMAIL to correct it, or CANCEL. Never send a password.",
    )
  if (command === "CHANGE EMAIL" && state.stage === "code")
    return result(
      {
        ...state,
        stage: "email",
        email: undefined,
        challengeExpiresAt: undefined,
      },
      message,
      "What email should we verify? Send the email address, or reply CANCEL.",
    )
  if (/^(?:HI|HELLO|HELP|HOW|HOW IT WORKS)$/.test(command)) {
    if (previous && previous.stage !== "email")
      return result(
        state,
        message,
        `Your ${state.mode === "sign_up" ? "registration" : "connection"} is still open. ${state.stage === "code" ? genericCodePrompt : "Reply CONTINUE to pick up where you left off, START OVER to restart, or CANCEL to stop."}`,
        false,
        state.stage === "code"
          ? undefined
          : [
              { command: "CONTINUE", title: "Continue" },
              { command: "START OVER", title: "Start over" },
              { command: "CANCEL", title: "Cancel" },
            ],
      )
    return result(
      state,
      message,
      /^(?:HOW|HOW IT WORKS)$/.test(command)
        ? "Connect: we email a six-digit code. Send it here, then choose your business and Store. Create account: answer a few questions, accept the Terms and verify your email. Nothing is created before email proof. I only see messages you send to this EwaTrade number. Never send a password. Your phone sign-in codes are separate."
        : greeting,
      false,
      [
        { command: "CONNECT", title: "Connect account" },
        { command: "REGISTER", title: "Create account" },
        { command: "HOW", title: "How it works" },
      ],
    )
  }
  if (command === "START OVER")
    return advanceWhatsAppOnboarding(
      {
        ...state,
        signup: undefined,
        email: undefined,
        stage: state.mode === "sign_up" ? "name" : "email",
      },
      { ...message, text: state.mode === "sign_up" ? "REGISTER" : "CONNECT" },
      adapters,
    )
  if (command === "CONTINUE") {
    if (
      state.mode === "sign_up" &&
      ["name", "business", "age", "location", "email", "legal"].includes(
        state.stage,
      )
    )
      return result(
        state,
        message,
        state.stage === "legal" && adapters.legal
          ? registrationReview(state, adapters.legal)
          : registrationPrompt(state),
      )
    const prompts: Partial<Record<Stage, string>> = {
      name: "What is your full name?",
      business: "What is your business name?",
      age: "Reply 1 for 13–15, 2 for 16–17, or 3 for 18 or older. Under 13 cannot register.",
      location: "Send your country and currency, for example NG NGN.",
      legal:
        "Reply YES to accept the Terms and acknowledge the Privacy Notice, or NO to cancel.",
      consent: state.selected ? consentReply(state.selected) : greeting,
      choose: chooseReply(state),
    }
    return result(state, message, prompts[state.stage] ?? greeting)
  }
  if (
    command === "RESEND" &&
    state.email &&
    (state.stage === "code" ||
      state.stage === "email" ||
      state.stage === "legal")
  )
    return requestCode()
  if (
    state.mode === "sign_up" &&
    ["name", "business", "age", "location", "email", "legal"].includes(
      state.stage,
    ) &&
    !(state.stage === "legal" && /^(?:YES|NO)$/.test(command))
  ) {
    const details = { ...state.signup, email: state.email }
    const missing = whatsAppRegistrationMissing(details)
    const fallback =
      missing.length === 1
        ? missing[0]
        : state.stage === "name"
          ? "name"
          : state.stage === "business"
            ? "businessName"
            : state.stage === "age"
              ? "ageBand"
              : undefined
    const collected = collectWhatsAppRegistrationDetails(text, fallback)
    if (collected.sensitive)
      return result(
        state,
        message,
        `Never send a password or verification code while entering account details. ${registrationPrompt(state)}`,
      )
    if (collected.underAge)
      return result(
        null,
        message,
        "You need to be 13 or older to use EwaTrade. Nothing was created, and your unfinished registration details were cleared.",
      )
    for (const field of collected.invalid) delete details[field]
    Object.assign(details, collected.patch)
    const { email, ...signup } = details
    state = {
      ...state,
      email,
      signup: {
        ...signup,
        acceptedTerms: undefined,
        acknowledgedPrivacyNotice: undefined,
      },
    }
    const remaining = whatsAppRegistrationMissing(details)
    if (remaining.length) {
      const stage: Stage = !signup.name
        ? "name"
        : !signup.businessName
          ? "business"
          : !signup.ageBand
            ? "age"
            : !signup.countryCode || !signup.currencyCode
              ? "location"
              : "email"
      return result(
        { ...state, stage },
        message,
        `${collected.invalid.length ? "Please correct the invalid details below. " : ""}${registrationPrompt(state)}`,
      )
    }
    if (!adapters.legal)
      return result(
        null,
        message,
        "Registration is temporarily unavailable. Please try again later.",
      )
    state = {
      ...state,
      stage: "legal",
      signup: { ...state.signup, legalVersion: adapters.legal.version },
    }
    return result(state, message, registrationReview(state, adapters.legal))
  }
  switch (state.stage) {
    case "email": {
      const email = collectWhatsAppRegistrationDetails(text).patch.email ?? ""
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return result(state, message, greeting)
      state = { ...state, email }
      if (state.mode === "login" || completeSignup(state.signup))
        return requestCode()
      return result(
        { ...state, stage: "name" },
        message,
        "What is your full name?",
      )
    }
    case "name":
      if (text.length < 1 || text.length > 120 || hasControl(text))
        return result(
          state,
          message,
          "Send your name using 1 to 120 characters.",
        )
      return result(
        {
          ...state,
          stage: "business",
          signup: { ...state.signup, name: text },
        },
        message,
        "What is your business name?",
      )
    case "business":
      if (text.length < 1 || text.length > 120 || hasControl(text))
        return result(
          state,
          message,
          "Send a business name using 1 to 120 characters.",
        )
      return result(
        {
          ...state,
          stage: "age",
          signup: { ...state.signup, businessName: text },
        },
        message,
        "Choose your age range: 1 = 13–15, 2 = 16–17, 3 = 18 or older. EwaTrade business accounts require age 13 or older.",
      )
    case "age": {
      if (/^(?:UNDER 13|12|UNDER THIRTEEN)$/.test(command))
        return result(
          null,
          message,
          "You need to be 13 or older to use EwaTrade. Nothing was created, and your unfinished registration details were cleared.",
        )
      const ageBand = (
        { "1": "AGE_13_TO_15", "2": "AGE_16_TO_17", "3": "ADULT" } as const
      )[text as "1" | "2" | "3"]
      if (!ageBand)
        return result(
          state,
          message,
          "Reply 1 for 13–15, 2 for 16–17, or 3 for 18 or older. Reply CANCEL if none applies.",
        )
      return result(
        { ...state, stage: "location", signup: { ...state.signup, ageBand } },
        message,
        "Send your two-letter country and currency, for example NG NGN. Supported currencies: NGN, USD, GHS, KES, ZAR, EGP.",
      )
    }
    case "location": {
      const [countryCode, currencyCode, extra] = command.split(/\s+/)
      if (
        !countryCode ||
        !findCountry(countryCode) ||
        !isOperatingCurrencyCode(currencyCode) ||
        extra
      )
        return result(
          state,
          message,
          "Send a two-letter country and supported currency, for example NG NGN.",
        )
      if (!adapters.legal)
        return result(
          null,
          message,
          "Registration is temporarily unavailable. Please try again later.",
        )
      return result(
        {
          ...state,
          stage: "legal",
          signup: {
            ...state.signup,
            countryCode,
            currencyCode,
            legalVersion: adapters.legal.version,
          },
        },
        message,
        `Create ${label(state.signup?.businessName ?? "your business")} in ${countryCode}, using ${currencyCode}.\nTerms: ${adapters.legal.termsUrl}\nPrivacy Notice: ${adapters.legal.privacyUrl}\nReply YES to accept the Terms, acknowledge the Privacy Notice and receive an email verification code. Reply NO to cancel.`,
      )
    }
    case "legal":
      if (command === "NO")
        return result(
          null,
          message,
          "Registration cancelled. No business was created.",
        )
      if (command !== "YES")
        return result(
          state,
          message,
          "Reply YES to accept the Terms and acknowledge the Privacy Notice, or NO to cancel.",
        )
      if (
        !adapters.legal ||
        adapters.legal.version !== state.signup?.legalVersion
      )
        return result(
          null,
          message,
          "The legal documents changed. Send REGISTER to review the current version.",
        )
      state = {
        ...state,
        signup: {
          ...state.signup,
          acceptedTerms: true,
          acknowledgedPrivacyNotice: true,
        },
      }
      if (state.email) return requestCode()
      return result(
        { ...state, stage: "email" },
        message,
        "What email should the account use? We will send a six-digit verification code. Nothing is created until you verify it.",
      )
    case "code": {
      const code = text.replace(/^(\d{3})\s(\d{3})$/, "$1$2")
      if (!/^\d{6}$/.test(code))
        return result(
          state,
          message,
          "Send only the six-digit code from your verification email, or reply RESEND. Never send your password.",
        )
      if (!state.challengeExpiresAt || state.challengeExpiresAt <= message.now)
        return result(
          state,
          message,
          "That code has expired. Reply RESEND for a new email code.",
        )
      let principal: WhatsAppOnboardingPrincipal | null = null
      try {
        principal = await adapters.verifyEmail({
          phoneNumberId: message.phoneNumberId,
          senderId: message.senderId,
          email: state.email ?? "",
          mode: state.mode,
          ...(completeSignup(state.signup)
            ? { signup: completeSignup(state.signup) }
            : {}),
          code,
          operationId: message.messageId,
        })
      } catch {
        // Authentication errors must not disclose account existence or reach the model.
      }
      if (!principal)
        return result(
          { ...state, attempts: state.attempts + 1 },
          message,
          state.attempts + 1 >= maxAttempts
            ? "Too many verification attempts. Wait until this session expires before starting again."
            : "We could not verify that code. Check the email and try again, or reply REGISTER if you need a new account.",
        )
      // Proof may authenticate another account, but it cannot replace this number's current identity.
      if (
        adapters.connectedUserId &&
        adapters.connectedUserId !== principal.userId
      )
        return result(
          null,
          message,
          "This WhatsApp number is already connected to another account. Your existing connection stays. Keep chatting, or send DISCONNECT first to change accounts.",
          false,
          [
            { command: "KEEP", title: "Keep chatting" },
            { command: "HELP", title: "What can I ask?" },
          ],
        )
      const choices = (await adapters.choices(principal)).map((choice) => ({
        tenantId: choice.tenantId,
        storeId: choice.storeId,
        membershipId: choice.membershipId,
        businessName: choice.businessName,
        storeName: choice.storeName,
      }))
      state = {
        ...state,
        principal: { userId: principal.userId, sessionId: principal.sessionId },
        choices,
        page: 0,
        signup: undefined,
        challengeExpiresAt: undefined,
      }
      if (!choices.length)
        return result(
          null,
          message,
          "Email verified, but no eligible business and Store is available to connect. Use EwaTrade to review your business access, then send CONNECT.",
        )
      if (choices.length === 1 && choices[0])
        return result(
          {
            ...state,
            stage: "consent",
            selected: choices[0],
            expiresAt: Math.min(state.expiresAt, message.now + 10 * 60_000),
          },
          message,
          consentReply(choices[0]),
        )
      return result({ ...state, stage: "choose" }, message, chooseReply(state))
    }
    case "choose": {
      const choices = state.choices ?? []
      if (command === "NEXT" || command === "BACK") {
        const lastPage = Math.max(0, Math.ceil(choices.length / pageSize) - 1)
        state = {
          ...state,
          page: Math.max(
            0,
            Math.min(
              lastPage,
              (state.page ?? 0) + (command === "NEXT" ? 1 : -1),
            ),
          ),
        }
        return result(state, message, chooseReply(state))
      }
      const choice = /^\d{1,3}$/.test(text)
        ? choices[Number(text) - 1]
        : undefined
      if (!choice) return result(state, message, chooseReply(state))
      return result(
        {
          ...state,
          stage: "consent",
          selected: choice,
          expiresAt: Math.min(state.expiresAt, message.now + 10 * 60_000),
        },
        message,
        consentReply(choice),
      )
    }
    case "consent":
      if (command === "NO")
        return result(
          null,
          message,
          state.mode === "sign_up"
            ? "Your account is ready in the EwaTrade app. This WhatsApp is not connected. Send CONNECT whenever you are ready."
            : "No WhatsApp connection was made. Send CONNECT whenever you are ready.",
        )
      if (command !== "YES" || !state.principal || !state.selected)
        return result(
          state,
          message,
          state.selected ? consentReply(state.selected) : greeting,
        )
      try {
        await adapters.connect({
          phoneNumberId: message.phoneNumberId,
          senderId: message.senderId,
          userId: state.principal.userId,
          sessionId: state.principal.sessionId,
          choice: state.selected,
          operationId: message.messageId,
        })
      } catch {
        return result(
          null,
          message,
          "We could not connect this business. Your business access may have changed. Send CONNECT to verify again.",
        )
      }
      return result(
        {
          ...state,
          stage: "complete",
          principal: undefined,
          choices: undefined,
        },
        message,
        whatsAppOnboardingWelcome(state.selected),
        true,
      )
    case "complete":
      return result(
        state,
        message,
        "Your connection is complete. Send HELP for guidance, or DISCONNECT to remove it.",
        true,
      )
  }
}
