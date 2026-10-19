export const QUOTE_WIRE_MAX_BYTES = 1024 * 1024

export type QuoteWireBodyFailure =
  | "body_byte_limit"
  | "unsupported_encoding"
  | "invalid_utf8"
  | "invalid_json"
  | "aborted"
  | "unreadable"

export class QuoteWireBodyError extends Error {
  constructor(readonly reason: QuoteWireBodyFailure) {
    super(
      reason === "body_byte_limit"
        ? "This quotation edit is too large. Keep the draft and edit one option at a time."
        : "The quotation request could not be read. Keep the draft and try again.",
    )
    this.name = "QuoteWireBodyError"
  }
}

/**
 * Admission for the dedicated JSON Quote transport, before schema parsing.
 * Counts actual encoded bytes, including the whole request envelope. A caller
 * must still authenticate, parse its strict schema and enforce fresh authority.
 * This function is not installed on existing tRPC or chat routes.
 */
export async function readQuoteWireJSON(
  request: Request,
  maxBytes = QUOTE_WIRE_MAX_BYTES,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new RangeError("Use a positive safe quotation request byte budget.")
  const encoding = request.headers.get("content-encoding")?.trim().toLowerCase()
  if (encoding && encoding !== "identity")
    throw new QuoteWireBodyError("unsupported_encoding")
  const length = request.headers.get("content-length")?.trim()
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes)
    throw new QuoteWireBodyError("body_byte_limit")
  if (request.signal.aborted) throw new QuoteWireBodyError("aborted")
  if (!request.body || request.bodyUsed)
    throw new QuoteWireBodyError("unreadable")

  let reader: ReadableStreamDefaultReader<Uint8Array>
  try {
    reader = request.body.getReader()
  } catch {
    throw new QuoteWireBodyError("unreadable")
  }
  const cancel = () => {
    // Cancellation must not wait on an unresponsive producer's cancel hook.
    void reader.cancel().catch(() => {})
  }
  request.signal.addEventListener("abort", cancel, { once: true })
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let bytes = 0
  const text: string[] = []
  try {
    // Cover an abort between the initial check and listener registration.
    if (request.signal.aborted) throw new QuoteWireBodyError("aborted")
    while (true) {
      const next = await reader.read()
      if (request.signal.aborted) throw new QuoteWireBodyError("aborted")
      if (next.done) break
      if (next.value.byteLength > maxBytes - bytes)
        throw new QuoteWireBodyError("body_byte_limit")
      bytes += next.value.byteLength
      try {
        const part = decoder.decode(next.value, { stream: true })
        if (part) text.push(part)
      } catch {
        throw new QuoteWireBodyError("invalid_utf8")
      }
    }
    try {
      const last = decoder.decode()
      if (last) text.push(last)
    } catch {
      throw new QuoteWireBodyError("invalid_utf8")
    }
    if (request.signal.aborted) throw new QuoteWireBodyError("aborted")
    try {
      return JSON.parse(text.join(""))
    } catch {
      throw new QuoteWireBodyError("invalid_json")
    }
  } catch (error) {
    cancel()
    if (error instanceof QuoteWireBodyError) throw error
    throw new QuoteWireBodyError(
      request.signal.aborted ? "aborted" : "unreadable",
    )
  } finally {
    request.signal.removeEventListener("abort", cancel)
    reader.releaseLock()
  }
}
