import { resolveTenantDomain } from "@ewatrade/utils"
import {
  EXPENSE_RECEIPT_CONTENT_TYPES,
  validateExpenseReceiptFile,
} from "./expense-receipt-state"

export function createExpenseReceiptFetcher(
  fetcher: typeof fetch,
  tenantSlug: () => string | null,
) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const currentTenant = tenantSlug()
    if (currentTenant) headers.set("x-tenant-slug", currentTenant)
    return fetcher(input, {
      ...init,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    })
  }
}

function getTenantSlugFromBrowserHost() {
  if (typeof window === "undefined") return null
  const result = resolveTenantDomain(window.location.host, {
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  })
  return result.kind === "tenant" ? result.tenantSlug : null
}

const receiptFetch = createExpenseReceiptFetcher(
  fetch,
  getTenantSlugFromBrowserHost,
)

export type ExpenseReceiptIntent = {
  id: string
  uploadState: string
  safetyState: string
  attachmentState: string
}

function readError(value: unknown, fallback: string) {
  return value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
    ? value.error
    : fallback
}

async function readJson(
  response: Response,
  fallback: string,
): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new Error(fallback)
  }
}

export async function digestExpenseReceipt(file: File, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const invalid = validateExpenseReceiptFile(file)
  if (invalid) throw new Error(invalid)
  const contentType = EXPENSE_RECEIPT_CONTENT_TYPES.find(
    (type) => type === file.type,
  )
  if (!contentType) throw new Error("Choose a supported receipt file.")
  const bytes = new Uint8Array(await file.arrayBuffer())
  signal?.throwIfAborted()
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  signal?.throwIfAborted()
  const digest = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  return {
    bytes,
    digest,
    contentType,
  }
}

export async function expenseReceiptIntentIdentity(input: {
  fileName: string
  contentType: (typeof EXPENSE_RECEIPT_CONTENT_TYPES)[number]
  sizeBytes: number
  contentDigest: string
}) {
  const canonical = JSON.stringify([
    input.fileName.trim(),
    input.contentType,
    input.sizeBytes,
    input.contentDigest,
  ])
  const bytes = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

export function expenseReceiptUploadUrl(
  assetId: string,
  bookId: string,
  billId: string,
) {
  const params = new URLSearchParams({ bookId, billId })
  return `/api/finance/expense-receipts/${encodeURIComponent(assetId)}/upload?${params}`
}

export function expenseReceiptDownloadGrantRequest(
  assetId: string,
  bookId: string,
  billId: string,
) {
  const source = new URLSearchParams({ bookId, billId })
  return {
    url: `/api/finance/expense-receipts/${encodeURIComponent(assetId)}/download-grant?${source}`,
    init: { method: "POST" as const },
  }
}

export function expenseReceiptOriginalRequest(
  assetId: string,
  bookId: string,
  billId: string,
  token: string,
) {
  const source = new URLSearchParams({ bookId, billId })
  return {
    url: `/api/finance/expense-receipts/${encodeURIComponent(assetId)}/original?${source}`,
    init: {
      method: "GET" as const,
      headers: { "X-Receipt-Download-Token": token },
    },
  }
}

export async function uploadExpenseReceiptOriginal(input: {
  bookId: string
  billId: string
  assetId: string
  contentType: string
  bytes: Uint8Array
  signal: AbortSignal
}): Promise<ExpenseReceiptIntent> {
  input.signal.throwIfAborted()
  const response = await receiptFetch(
    expenseReceiptUploadUrl(input.assetId, input.bookId, input.billId),
    {
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      body: new Blob([input.bytes.slice().buffer], { type: input.contentType }),
      signal: input.signal,
    },
  )
  input.signal.throwIfAborted()
  const body = await readJson(
    response,
    "Receipt upload could not be confirmed. Retry the same file.",
  )
  if (!response.ok)
    throw new Error(
      readError(body, "Receipt upload failed. Retry the same file."),
    )
  if (
    !body ||
    typeof body !== "object" ||
    !("id" in body) ||
    body.id !== input.assetId ||
    !("uploadState" in body) ||
    body.uploadState !== "VERIFIED" ||
    !("safetyState" in body) ||
    typeof body.safetyState !== "string" ||
    !("attachmentState" in body) ||
    typeof body.attachmentState !== "string"
  )
    throw new Error(
      "Receipt upload could not be confirmed. Retry the same file.",
    )
  return {
    id: input.assetId,
    uploadState: body.uploadState,
    safetyState: body.safetyState,
    attachmentState: body.attachmentState,
  }
}

export async function downloadExpenseReceiptOriginal(input: {
  bookId: string
  billId: string
  assetId: string
  contentType: string
  signal: AbortSignal
  assertCurrent(): void
}) {
  input.signal.throwIfAborted()
  input.assertCurrent()
  const grantRequest = expenseReceiptDownloadGrantRequest(
    input.assetId,
    input.bookId,
    input.billId,
  )
  const grantResponse = await receiptFetch(grantRequest.url, {
    ...grantRequest.init,
    signal: input.signal,
  })
  input.signal.throwIfAborted()
  input.assertCurrent()
  const grant = await readJson(
    grantResponse,
    "A private receipt download grant could not be issued.",
  )
  if (!grantResponse.ok)
    throw new Error(
      readError(grant, "A private receipt download grant could not be issued."),
    )
  if (
    !grant ||
    typeof grant !== "object" ||
    !("token" in grant) ||
    typeof grant.token !== "string" ||
    !grant.token ||
    !("expiresAt" in grant) ||
    typeof grant.expiresAt !== "string"
  )
    throw new Error("The private receipt grant could not be confirmed.")

  input.signal.throwIfAborted()
  input.assertCurrent()
  const originalRequest = expenseReceiptOriginalRequest(
    input.assetId,
    input.bookId,
    input.billId,
    grant.token,
  )
  const originalResponse = await receiptFetch(originalRequest.url, {
    ...originalRequest.init,
    signal: input.signal,
  })
  input.signal.throwIfAborted()
  input.assertCurrent()
  if (!originalResponse.ok) {
    const errorBody = await readJson(
      originalResponse,
      "The private receipt could not be downloaded. Request a new grant.",
    )
    throw new Error(
      readError(
        errorBody,
        "The private receipt could not be downloaded. Request a new grant.",
      ),
    )
  }
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
  }
  const extension = extensions[input.contentType]
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.assetId))
    throw new Error("The private receipt original could not be verified.")
  const expectedFileName = `receipt-${input.assetId}.${extension}`
  const contentType = originalResponse.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
  const contentDisposition = originalResponse.headers.get("content-disposition")
  if (
    !extension ||
    contentType !== input.contentType ||
    contentDisposition !== `attachment; filename="${expectedFileName}"`
  )
    throw new Error("The private receipt original could not be verified.")
  const blob = await originalResponse.blob()
  input.signal.throwIfAborted()
  input.assertCurrent()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = expectedFileName
  link.rel = "noopener"
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
