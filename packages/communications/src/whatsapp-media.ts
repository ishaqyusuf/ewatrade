import { createHash } from "node:crypto"

const META_GRAPH_URL = "https://graph.facebook.com/v21.0"
const MAX_MEDIA_BYTES = 10 * 1024 * 1024
const MAX_METADATA_BYTES = 32 * 1024

export type WhatsAppMediaRequest = {
  accessToken: string
  phoneNumberId: string
  mediaId: string
  maxBytes?: number
  expectedMediaType?: string
  expectedSha256?: string
  signal?: AbortSignal
}

export class WhatsAppMediaError extends Error {
  constructor(
    readonly code: "INVALID_MEDIA" | "MEDIA_TOO_LARGE" | "MEDIA_UNAVAILABLE",
  ) {
    super("This WhatsApp attachment could not be retrieved safely.")
    this.name = "WhatsAppMediaError"
  }
}

function fail(code: WhatsAppMediaError["code"] = "INVALID_MEDIA"): never {
  throw new WhatsAppMediaError(code)
}

function mime(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? ""
}

function digest(value: unknown) {
  if (typeof value !== "string") return fail()
  if (/^[a-fA-F0-9]{64}$/.test(value)) return value.toLowerCase()
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return fail()
  const bytes = Buffer.from(value, "base64")
  if (bytes.length !== 32 || bytes.toString("base64") !== value) return fail()
  return bytes.toString("hex")
}

/** Exact Meta attachment CDN only. Never forward the bearer to a record URL. */
function privateMediaUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 8192) return fail()
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return fail()
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "lookaside.fbsbx.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith("/whatsapp_business/attachments/")
  )
    return fail()
  return url
}

async function boundedBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  expectedSize?: number,
) {
  if (!response.ok || response.redirected || !response.body)
    return fail("MEDIA_UNAVAILABLE")
  const length = response.headers.get("content-length")
  if (
    length !== null &&
    (!/^\d+$/.test(length) ||
      Number(length) > maxBytes ||
      (expectedSize !== undefined && Number(length) !== expectedSize))
  ) {
    await response.body.cancel().catch(() => undefined)
    return fail("MEDIA_TOO_LARGE")
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const onAbort = () => void reader.cancel().catch(() => undefined)
  signal.addEventListener("abort", onAbort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const part = await reader.read()
      signal.throwIfAborted()
      if (part.done) break
      size += part.value.byteLength
      if (size > maxBytes || chunks.length >= 65_536)
        return fail("MEDIA_TOO_LARGE")
      chunks.push(part.value)
    }
    if (!size || (expectedSize !== undefined && size !== expectedSize))
      return fail()
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  } finally {
    signal.removeEventListener("abort", onAbort)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** No URL, token, response body or provider diagnostic escapes this boundary. */
export async function fetchWhatsAppMedia(
  input: WhatsAppMediaRequest,
  fetcher: typeof fetch = fetch,
) {
  const maxBytes = input.maxBytes ?? MAX_MEDIA_BYTES
  if (
    !/^[A-Za-z0-9_-]{1,256}$/.test(input.mediaId) ||
    !/^\d{5,32}$/.test(input.phoneNumberId) ||
    !input.accessToken ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_MEDIA_BYTES
  )
    return fail()
  const timeout = AbortSignal.timeout(30_000)
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeout])
    : timeout
  const headers = { Authorization: `Bearer ${input.accessToken}` }
  try {
    signal.throwIfAborted()
    const metadataResponse = await fetcher(
      `${META_GRAPH_URL}/${encodeURIComponent(input.mediaId)}?phone_number_id=${encodeURIComponent(input.phoneNumberId)}`,
      { headers, redirect: "error", signal },
    )
    const metadata: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await boundedBody(metadataResponse, MAX_METADATA_BYTES, signal),
      ),
    )
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
      return fail()
    const record = metadata as Record<string, unknown>
    const size = record.file_size
    const mediaType =
      typeof record.mime_type === "string" ? mime(record.mime_type) : ""
    const contentDigest = digest(record.sha256)
    if (
      String(record.id ?? "") !== input.mediaId ||
      typeof size !== "number" ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType) ||
      (input.expectedMediaType &&
        mime(input.expectedMediaType) !== mediaType) ||
      (input.expectedSha256 && digest(input.expectedSha256) !== contentDigest)
    )
      return fail()
    if (size > maxBytes) return fail("MEDIA_TOO_LARGE")
    const response = await fetcher(privateMediaUrl(record.url), {
      headers,
      redirect: "error",
      signal,
    })
    if (mime(response.headers.get("content-type") ?? "") !== mediaType) {
      await response.body?.cancel().catch(() => undefined)
      return fail()
    }
    const bytes = await boundedBody(response, maxBytes, signal, size)
    if (createHash("sha256").update(bytes).digest("hex") !== contentDigest)
      return fail()
    return { bytes, mediaType, contentDigest, sizeBytes: size }
  } catch (error) {
    if (error instanceof WhatsAppMediaError) throw error
    throw new WhatsAppMediaError("MEDIA_UNAVAILABLE")
  }
}
