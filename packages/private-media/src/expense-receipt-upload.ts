import { createHash } from "node:crypto"
import { detectServiceCommerceMediaMimeType } from "@ewatrade/service-commerce"
import {
  EXPENSE_RECEIPT_MAX_BYTES,
  type ExpenseReceiptContentType,
} from "./expense-receipts"
import {
  assertPrivateObjectServer,
  privateObjectOperationSignal,
} from "./object-storage"

export class ExpenseReceiptUploadError extends Error {
  constructor(
    readonly status: 400 | 408 | 413,
    message: string,
  ) {
    super(message)
    this.name = "ExpenseReceiptUploadError"
  }
}

function cancel(body: ReadableStream<Uint8Array> | null) {
  if (body && !body.locked) void body.cancel().catch(() => undefined)
}

/** Caller resolves current authority and immutable original identity before reading request bytes. */
export async function readExpenseReceiptUpload(
  request: Request,
  original: {
    sizeBytes: number
    contentDigest: string
    contentType: ExpenseReceiptContentType
  },
) {
  assertPrivateObjectServer()
  const target = { ...original }
  const body = request.body
  const invalid = () =>
    new ExpenseReceiptUploadError(
      400,
      "Receipt bytes must match the original intent.",
    )
  try {
    if (
      !Number.isSafeInteger(target.sizeBytes) ||
      target.sizeBytes < 1 ||
      target.sizeBytes > EXPENSE_RECEIPT_MAX_BYTES
    )
      throw new ExpenseReceiptUploadError(
        413,
        "Choose an original receipt up to 10,000,000 bytes.",
      )
    if (
      !/^[a-f0-9]{64}$/.test(target.contentDigest) ||
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "application/pdf",
      ].includes(target.contentType)
    )
      throw invalid()
    const length = request.headers.get("content-length")
    const encoding = request.headers.get("content-encoding")
    if (
      request.headers.get("content-type") !== target.contentType ||
      (encoding !== null && encoding !== "identity") ||
      (length !== null &&
        (!/^\d{1,8}$/.test(length) || Number(length) !== target.sizeBytes)) ||
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
          if (signal.aborted) {
            abort()
            return
          }
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
      signal.throwIfAborted()
      if (next.done) break
      if (
        !(next.value instanceof Uint8Array) ||
        !next.value.byteLength ||
        ++chunks > 65_536 ||
        offset + next.value.byteLength > target.sizeBytes
      )
        throw new ExpenseReceiptUploadError(
          413,
          "Receipt exceeds its original upload size.",
        )
      bytes.set(next.value, offset)
      digest.update(bytes.subarray(offset, offset + next.value.byteLength))
      offset += next.value.byteLength
    }
    if (
      offset !== target.sizeBytes ||
      digest.digest("hex") !== target.contentDigest ||
      detectServiceCommerceMediaMimeType(bytes) !== target.contentType
    )
      throw invalid()
    return bytes
  } catch (error) {
    if (error instanceof ExpenseReceiptUploadError) throw error
    throw new ExpenseReceiptUploadError(
      408,
      "Receipt upload was interrupted. Retry the same original receipt.",
    )
  } finally {
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
