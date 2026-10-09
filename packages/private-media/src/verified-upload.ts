import { createHash } from "node:crypto"
import {
  assertPrivateObjectServer,
  privateObjectOperationSignal,
} from "./object-storage"

export class VerifiedUploadError extends Error {
  constructor(
    readonly status: 400 | 408 | 413,
    message: string,
  ) {
    super(message)
    this.name = "VerifiedUploadError"
  }
}

function cancel(body: ReadableStream<Uint8Array> | null) {
  if (body && !body.locked) void body.cancel().catch(() => undefined)
}

/**
 * Reads exactly the bytes a saved intent promised: declared type, length and
 * SHA-256 must match, and the content check must accept the bytes. The caller
 * resolves authority and the immutable intent before calling this.
 */
export async function readVerifiedUpload(
  request: Request,
  original: { sizeBytes: number; contentDigest: string; contentType: string },
  options: {
    maxBytes: number
    /** Signature/encoding check; return false to refuse the bytes. */
    accepts: (bytes: Uint8Array, contentType: string) => boolean
  },
) {
  assertPrivateObjectServer()
  const target = { ...original }
  const body = request.body
  const invalid = () =>
    new VerifiedUploadError(400, "The file must match the upload you started.")
  try {
    if (
      !Number.isSafeInteger(target.sizeBytes) ||
      target.sizeBytes < 1 ||
      target.sizeBytes > options.maxBytes
    )
      throw new VerifiedUploadError(413, "This file is too large.")
    const length = request.headers.get("content-length")
    const encoding = request.headers.get("content-encoding")
    if (
      !/^[a-f0-9]{64}$/.test(target.contentDigest) ||
      request.headers.get("content-type") !== target.contentType ||
      (encoding !== null && encoding !== "identity") ||
      (length !== null &&
        (!/^\d{1,9}$/.test(length) || Number(length) !== target.sizeBytes)) ||
      !body ||
      body.locked ||
      request.bodyUsed
    )
      throw invalid()
  } catch (error) {
    cancel(body)
    throw error
  }
  if (!body) throw invalid()
  const reader = body.getReader()
  const signal = privateObjectOperationSignal(request.signal)
  const bytes = new Uint8Array(target.sizeBytes)
  const digest = createHash("sha256")
  let offset = 0
  let chunks = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const next = await new Promise<Awaited<ReturnType<typeof reader.read>>>(
        (resolve, reject) => {
          const abort = () => {
            void reader.cancel().catch(() => undefined)
            reject(signal.reason)
          }
          signal.addEventListener("abort", abort, { once: true })
          if (signal.aborted) return abort()
          reader.read().then(
            (result) => {
              signal.removeEventListener("abort", abort)
              resolve(result)
            },
            (error) => {
              signal.removeEventListener("abort", abort)
              reject(error)
            },
          )
        },
      )
      if (next.done) break
      if (
        !(next.value instanceof Uint8Array) ||
        !next.value.byteLength ||
        ++chunks > 65_536 ||
        offset + next.value.byteLength > target.sizeBytes
      )
        throw new VerifiedUploadError(413, "This file is larger than declared.")
      bytes.set(next.value, offset)
      digest.update(next.value)
      offset += next.value.byteLength
    }
    if (
      offset !== target.sizeBytes ||
      digest.digest("hex") !== target.contentDigest ||
      !options.accepts(bytes, target.contentType)
    )
      throw invalid()
    return bytes
  } catch (error) {
    if (error instanceof VerifiedUploadError) throw error
    throw new VerifiedUploadError(
      408,
      "The upload was interrupted. Try the same file again.",
    )
  } finally {
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
