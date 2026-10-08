import { createOpenAiStoreConversationTextSafetyProvider } from "./store-conversation-text-safety-openai"

export type StoreConversationTextSafetyProvider = {
  inspect(input: { text: string; signal: AbortSignal }): Promise<{
    decision: "allow" | "reject" | "review"
  }>
}

const MAX_TEXT_SAFETY_WAIT_MS = 8_000

export class StoreConversationTextSafetyError extends Error {
  constructor(readonly kind: "rejected" | "unavailable") {
    super(
      kind === "rejected"
        ? "This message cannot be posted. Please revise it or contact support."
        : "Messages are paused while safety screening is unavailable.",
    )
    this.name = "StoreConversationTextSafetyError"
  }
}

/** A deterministic test fixture, not objectionable-content moderation. */
export function createQaStoreConversationTextSafetyProvider(): StoreConversationTextSafetyProvider {
  return {
    async inspect({ text }) {
      if (text.includes("[[qa-reject]]")) return { decision: "reject" }
      if (text.includes("[[qa-review]]")) return { decision: "review" }
      return { decision: "allow" }
    },
  }
}

/**
 * Production screens only through an explicitly selected live provider with a
 * key (`openai-moderation`); without one, every Production post fails closed.
 */
export function getConfiguredStoreConversationTextSafetyProvider(
  environment: NodeJS.ProcessEnv = process.env,
): StoreConversationTextSafetyProvider | null {
  const production =
    ["prod", "production"].includes(environment.APP_ENV ?? "") ||
    ["prod", "production"].includes(environment.DEV_PROFILE ?? "") ||
    (environment.NODE_ENV === "production" &&
      !["local", "dev", "development", "preview"].includes(
        environment.APP_ENV ?? environment.DEV_PROFILE ?? "",
      ))
  if (
    environment.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER === "openai-moderation"
  ) {
    if (
      production &&
      !environment.STORE_CONVERSATION_TEXT_SAFETY_APPROVAL_REFERENCE?.trim()
    )
      return null
    const apiKey =
      environment.STORE_CONVERSATION_TEXT_SAFETY_OPENAI_API_KEY?.trim() ||
      environment.OPENAI_API_KEY?.trim()
    return apiKey
      ? createOpenAiStoreConversationTextSafetyProvider({ apiKey })
      : null
  }

  if (production) return null

  // Local development uses the deterministic QA screen. Preview still opts in
  // explicitly, and Production can never select this fixture.
  if (
    (environment.APP_ENV === "local" ||
      (!environment.APP_ENV && environment.DEV_PROFILE === "local")) &&
    !environment.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER
  )
    return createQaStoreConversationTextSafetyProvider()

  if (environment.NODE_ENV === "test")
    return createQaStoreConversationTextSafetyProvider()

  if (
    environment.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER === "qa-fixture" &&
    (environment.APP_ENV === "local" ||
      environment.APP_ENV === "development" ||
      environment.APP_ENV === "preview")
  ) {
    return createQaStoreConversationTextSafetyProvider()
  }
  return null
}

/** Require an allow verdict before any text message is committed or dispatched. */
export async function requireStoreConversationTextSafety(
  text: string,
  provider: StoreConversationTextSafetyProvider | null = getConfiguredStoreConversationTextSafetyProvider(),
  timeoutMs = MAX_TEXT_SAFETY_WAIT_MS,
): Promise<void> {
  if (!provider) throw new StoreConversationTextSafetyError("unavailable")

  let decision: "allow" | "reject" | "review"
  const controller = new AbortController()
  const waitMs = Number.isFinite(timeoutMs)
    ? Math.max(1, Math.min(Math.trunc(timeoutMs), MAX_TEXT_SAFETY_WAIT_MS))
    : MAX_TEXT_SAFETY_WAIT_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error("Text safety provider timed out"))
      }, waitMs)
    })
    const result = await Promise.race([
      provider.inspect({ text, signal: controller.signal }),
      deadline,
    ])
    decision = result?.decision
  } catch {
    throw new StoreConversationTextSafetyError("unavailable")
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (decision === "allow") return
  if (decision === "reject" || decision === "review")
    throw new StoreConversationTextSafetyError("rejected")
  throw new StoreConversationTextSafetyError("unavailable")
}
