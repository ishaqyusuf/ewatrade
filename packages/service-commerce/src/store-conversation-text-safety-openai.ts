import type { StoreConversationTextSafetyProvider } from "./store-conversation-text-safety"

// Pin the snapshot so a silent model change cannot alter what is allowed.
export const OPENAI_TEXT_MODERATION_MODEL = "omni-moderation-2024-09-26"
export const OPENAI_TEXT_MODERATION_CATEGORIES = [
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
] as const
const MAX_RESPONSE_BYTES = 64 * 1024
const unavailable = () => new Error("Text safety screening is unavailable.")

type Fetch = (input: string, init: RequestInit) => Promise<Response>

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw unavailable()
  return value as Record<string, unknown>
}

async function readResult(response: Response, signal: AbortSignal) {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    throw unavailable()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_RESPONSE_BYTES) throw unavailable()
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return object(JSON.parse(new TextDecoder().decode(bytes)))
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/**
 * Server-only text moderation through OpenAI's moderation endpoint. Any flagged
 * category rejects; a partial, unexpected or failed response throws so the
 * gate fails closed. Never propagates the key, the text or the provider body.
 */
export function createOpenAiStoreConversationTextSafetyProvider(options: {
  apiKey: string
  fetch?: Fetch
}): StoreConversationTextSafetyProvider {
  if ("window" in globalThis || !options.apiKey.trim()) throw unavailable()
  const key = options.apiKey.trim()
  const send: Fetch = options.fetch ?? ((input, init) => fetch(input, init))
  return {
    async inspect({ text, signal }) {
      try {
        signal.throwIfAborted()
        const response = await send("https://api.openai.com/v1/moderations", {
          method: "POST",
          redirect: "error",
          signal,
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: OPENAI_TEXT_MODERATION_MODEL,
            input: text,
          }),
        })
        const result = await readResult(response, signal)
        if (
          result.model !== OPENAI_TEXT_MODERATION_MODEL ||
          !Array.isArray(result.results) ||
          result.results.length !== 1
        )
          throw unavailable()
        const verdict = object(result.results[0])
        const categoryFlags = object(verdict.categories)
        const categories = Object.values(categoryFlags)
        if (
          typeof verdict.flagged !== "boolean" ||
          OPENAI_TEXT_MODERATION_CATEGORIES.some(
            (category) => typeof categoryFlags[category] !== "boolean",
          ) ||
          categories.some((value) => typeof value !== "boolean")
        )
          throw unavailable()
        return {
          decision:
            verdict.flagged || categories.includes(true) ? "reject" : "allow",
        }
      } catch {
        throw unavailable()
      }
    },
  }
}
