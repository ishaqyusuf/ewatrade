import {
  containsRegistrationProof,
  publicAssistantInput,
  publicAssistantReply,
} from "@ewatrade/assistant/public/contracts"
import {
  getTrustedPrivacyNetworkSource,
  getTrustedQaNetworkSource,
} from "@ewatrade/utils/qa-network-source"
import { answerPublicAssistant } from "./public-chat-service"

type Dependencies = { answer: typeof answerPublicAssistant; now: () => number }
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
}
const response = (body: unknown, status = 200) =>
  Response.json(body, { status, headers })

/** Process-local public admission, bounded globally and by trusted network source. No tenant allowance is consumed. */
export function createPublicAssistantRoute(
  deps: Dependencies = { answer: answerPublicAssistant, now: Date.now },
) {
  const buckets = new Map<
    string,
    { at: number; count: number; active: number }
  >()
  let total = { at: 0, count: 0, active: 0 }
  return async function POST(request: Request) {
    const origin = request.headers.get("origin")
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host
    let allowed = false
    try {
      allowed = !!origin && new URL(origin).host === host
    } catch {
      /* Fail closed. */
    }
    if (
      !allowed ||
      !request.headers.get("content-type")?.startsWith("application/json")
    )
      return response({ message: "Reload the page and try again." }, 403)
    // Bound actual bytes; Content-Length is not an authority.
    const reader = request.body?.getReader()
    if (!reader) return response({ message: "Send a question." }, 400)
    let size = 0
    let raw = ""
    const decoder = new TextDecoder()
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 16_384) {
          await reader.cancel()
          return response(
            { message: "This conversation is too long. Reset and try again." },
            413,
          )
        }
        raw += decoder.decode(part.value, { stream: true })
      }
      raw += decoder.decode()
    } catch {
      return response({ message: "The message could not be read." }, 400)
    }
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      return response({ message: "Send a valid question." }, 400)
    }
    const parsed = publicAssistantInput.safeParse(value)
    if (!parsed.success)
      return response(
        { message: "Keep your question under 1,000 characters and try again." },
        400,
      )
    if (
      parsed.data.messages.some((message) =>
        containsRegistrationProof(
          message.content,
          message.role === "assistant",
        ),
      )
    )
      return response({
        reply:
          "Keep contact details and verification codes in the registration controls. I can open those here so they stay out of the AI conversation.",
        startRegistration: true,
      })
    const now = deps.now()
    for (const [key, bucket] of buckets)
      if (now - bucket.at >= 600_000 && !bucket.active) buckets.delete(key)
    if (now - total.at >= 600_000 && !total.active)
      total = { at: now, count: 0, active: 0 }
    const source = {
      env: process.env,
      getHeader: (name: string) => request.headers.get(name),
    }
    const key =
      getTrustedPrivacyNetworkSource(source) ??
      getTrustedQaNetworkSource(source) ??
      "unverified-network"
    let bucket = buckets.get(key)
    if (!bucket) {
      if (buckets.size >= 1000)
        return response(
          { message: "The assistant is busy. Try again later." },
          429,
        )
      bucket = { at: now, count: 0, active: 0 }
      buckets.set(key, bucket)
    }
    if (
      bucket.count >= 20 ||
      bucket.active ||
      total.count >= 200 ||
      total.active >= 4
    )
      return response(
        { message: "The assistant is busy. Wait a few minutes and try again." },
        429,
      )
    bucket.count++
    bucket.active++
    total.count++
    total.active++
    const heldTotal = total
    try {
      const result = await deps.answer(
        parsed.data,
        AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
      )
      if (!result)
        return response(
          {
            message:
              "The live assistant is unavailable. You can still register your business here or try again later.",
          },
          503,
        )
      const safe = publicAssistantReply.safeParse(result)
      return safe.success
        ? response(safe.data)
        : response(
            { message: "The assistant could not answer. Try again." },
            502,
          )
    } catch {
      return response(
        {
          message:
            "The assistant could not finish that answer. Please try again.",
        },
        502,
      )
    } finally {
      bucket.active--
      heldTotal.active--
    }
  }
}
export const POST = createPublicAssistantRoute()
