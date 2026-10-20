import { findCountry } from "@ewatrade/utils/countries"
import type { OperatingCurrencyCode } from "@ewatrade/utils/currency"
import { isOperatingCurrencyCode } from "@ewatrade/utils/currency"

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
}

export type WhatsAppOnboardingResult = {
  state: WhatsAppOnboardingState | null
  reply: string
  connected: boolean
}

export type WhatsAppOnboardingAdapters = {
  legal: { version: string; termsUrl: string; privacyUrl: string } | null
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
const pageSize = 5
const maxAttempts = 5
const greeting =
  "Welcome to EwaTrade. Connect your business using email verification. Send your account email, or reply REGISTER to create a business here. Never send a password. Reply CANCEL at any time."
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
): WhatsAppOnboardingResult {
  return {
    state: state
      ? { ...state, lastMessageId: message.messageId, lastReply: reply }
      : null,
    reply,
    connected,
  }
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
  return `You are connected to ${label(choice.businessName)} — ${label(choice.storeName)}.\nTry “Help”, “Show my sales” or “Check stock”. Actions still need your permissions and any required review. Send DISCONNECT to remove this WhatsApp connection.`
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
  const text = message.text.trim()
  const command = text.toUpperCase()
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
    state = {
      version: 1,
      phoneNumberId: message.phoneNumberId,
      senderId: message.senderId,
      stage: "email",
      mode: command === "REGISTER" ? "sign_up" : "login",
      expiresAt: state.expiresAt,
      attempts: state.attempts,
      requestedAt: state.requestedAt,
    }
    return result(
      state,
      message,
      command === "REGISTER"
        ? "Let’s create your business with email verification. Send your email address. Never send a password."
        : greeting,
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
  if (
    command === "RESEND" &&
    state.email &&
    (state.stage === "code" ||
      state.stage === "email" ||
      state.stage === "legal")
  )
    return requestCode()
  switch (state.stage) {
    case "email": {
      const email = text.toLowerCase()
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return result(state, message, greeting)
      state = { ...state, email }
      if (state.mode === "login") return requestCode()
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
      return requestCode()
    case "code": {
      if (!/^\d{6}$/.test(text))
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
          code: text,
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
          { ...state, stage: "consent", selected: choices[0] },
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
        { ...state, stage: "consent", selected: choice },
        message,
        consentReply(choice),
      )
    }
    case "consent":
      if (command === "NO")
        return result(
          null,
          message,
          "No WhatsApp connection was made. Send CONNECT whenever you are ready.",
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
