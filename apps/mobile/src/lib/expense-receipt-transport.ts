import { EXPENSE_RECEIPT_MAX_BYTES } from "@ewatrade/utils/expense-receipt-state"

export type ReceiptSource = { bookId: string; billId: string; assetId: string }
type ReceiptRequest = {
  method: "GET" | "POST" | "PUT"
  headers?: Record<string, string>
  body?: ArrayBuffer
  signal: AbortSignal
  redirect?: "error"
  cache?: "no-store"
}
function assertReceiptSignal(signal: AbortSignal) {
  if (signal.aborted)
    throw new Error("Receipt action was cancelled. Retry the same receipt.")
}

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
}

/** Session-bound transport; tokens stay in headers and never become file URLs. */
export function createExpenseReceiptTransport(runtime: {
  baseUrl: string
  headers: Record<string, string>
  fetch: (
    url: string,
    init: ReceiptRequest,
  ) => Promise<Pick<Response, "ok" | "json" | "headers" | "body">>
  assertCurrent(): void
}) {
  function url(source: ReceiptSource, action: string) {
    const params = new URLSearchParams({
      bookId: source.bookId,
      billId: source.billId,
    })
    return `${runtime.baseUrl}/api/finance/expense-receipts/${encodeURIComponent(source.assetId)}/${action}?${params}`
  }
  async function request(
    source: ReceiptSource,
    action: string,
    init: ReceiptRequest,
  ) {
    assertReceiptSignal(init.signal)
    runtime.assertCurrent()
    const response = await runtime.fetch(url(source, action), {
      ...init,
      redirect: "error",
      cache: "no-store",
      headers: { ...runtime.headers, ...init.headers },
    })
    assertReceiptSignal(init.signal)
    runtime.assertCurrent()
    if (!response.ok) {
      // Transport exception text can contain private diagnostics. Use only authored HTTP errors.
      const value: unknown = await response.json().catch(() => null)
      runtime.assertCurrent()
      throw new Error(
        value &&
          typeof value === "object" &&
          "error" in value &&
          typeof value.error === "string"
          ? value.error
          : "Receipt access failed. Retry the same receipt.",
      )
    }
    return response
  }
  return {
    async upload(
      source: ReceiptSource,
      bytes: Uint8Array,
      contentType: string,
      signal: AbortSignal,
    ) {
      const response = await request(source, "upload", {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: bytes.slice().buffer,
        signal,
      })
      const result: unknown = await response.json()
      assertReceiptSignal(signal)
      runtime.assertCurrent()
      if (
        !result ||
        typeof result !== "object" ||
        !("id" in result) ||
        result.id !== source.assetId ||
        !("uploadState" in result) ||
        result.uploadState !== "VERIFIED"
      )
        throw new Error(
          "Receipt upload could not be confirmed. Retry the same file.",
        )
    },
    async download(
      source: ReceiptSource,
      contentType: string,
      sizeBytes: number,
      signal: AbortSignal,
    ) {
      const extension = extensions[contentType]
      if (
        !extension ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(source.assetId) ||
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 1 ||
        sizeBytes > EXPENSE_RECEIPT_MAX_BYTES
      )
        throw new Error("Receipt original could not be verified.")
      const response = await request(source, "download-grant", {
        method: "POST",
        signal,
      })
      const grant: unknown = await response.json()
      assertReceiptSignal(signal)
      runtime.assertCurrent()
      if (
        !grant ||
        typeof grant !== "object" ||
        !("token" in grant) ||
        typeof grant.token !== "string" ||
        !grant.token ||
        !("expiresAt" in grant) ||
        typeof grant.expiresAt !== "string" ||
        !(Date.parse(grant.expiresAt) > Date.now())
      )
        throw new Error("Receipt download grant could not be confirmed.")
      const original = await request(source, "original", {
        method: "GET",
        headers: { "X-Receipt-Download-Token": grant.token },
        signal,
      })
      const filename = `receipt-${source.assetId}.${extension}`
      if (
        original.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
          contentType ||
        original.headers.get("content-disposition") !==
          `attachment; filename="${filename}"` ||
        original.headers.get("content-length") !== String(sizeBytes)
      ) {
        await original.body?.cancel()
        throw new Error("Receipt original could not be verified.")
      }
      // Bound body reads even if a broken transport ignores Content-Length.
      const reader = original.body?.getReader()
      if (!reader) throw new Error("Receipt original is unavailable.")
      const bytes = new Uint8Array(sizeBytes)
      let length = 0
      try {
        for (;;) {
          assertReceiptSignal(signal)
          runtime.assertCurrent()
          const chunk = await reader.read()
          assertReceiptSignal(signal)
          runtime.assertCurrent()
          if (chunk.done) break
          if (length + chunk.value.length > sizeBytes)
            throw new Error("Receipt original changed.")
          bytes.set(chunk.value, length)
          length += chunk.value.length
        }
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
      if (length !== sizeBytes)
        throw new Error("Receipt original is incomplete. Request it again.")
      return { bytes, filename, mimeType: contentType }
    },
  }
}
