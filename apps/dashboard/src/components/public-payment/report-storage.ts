/**
 * The customer's own payment report for one link, kept in this browser only.
 * The report token proves access to the report status; it never goes in the URL.
 * Storage is keyed by a hash of the link token so the raw token is not a key.
 */

export const receiptContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const
export type ReceiptContentType = (typeof receiptContentTypes)[number]

export type StoredReceipt = {
  contentType: ReceiptContentType
  contentDigest: string
  sizeBytes: number
  fileName: string
}

export type StoredReport = {
  v: 1
  /** Stable for every retry of one report; replaced only for a new report. */
  clientReportId: string
  payerName: string
  claimedAmountMinor: number
  receipt: StoredReceipt | null
  reportToken: string | null
  /** The report this one replaced, used to recover an "already being checked" conflict. */
  previousReportToken: string | null
  reportedAt: string | null
}

const KEY_PREFIX = "ewatrade.payment-report."
// Denied/full storage must still preserve safe retries during the current visit.
const visitReports = new Map<string, StoredReport>()

function fnv1a(value: string, seed: number) {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

export function reportStorageKey(linkToken: string) {
  return `${KEY_PREFIX}${fnv1a(linkToken, 0x811c9dc5)}${fnv1a(linkToken, 0x9e3779b9)}`
}

const operationId = /^[a-zA-Z0-9_-]{8,120}$/
const digest = /^[a-f0-9]{64}$/

function isStoredReceipt(value: unknown): value is StoredReceipt {
  if (!value || typeof value !== "object") return false
  const receipt = value as Record<string, unknown>
  return (
    typeof receipt.contentType === "string" &&
    (receiptContentTypes as readonly string[]).includes(receipt.contentType) &&
    typeof receipt.contentDigest === "string" &&
    digest.test(receipt.contentDigest) &&
    typeof receipt.sizeBytes === "number" &&
    Number.isSafeInteger(receipt.sizeBytes) &&
    receipt.sizeBytes > 0 &&
    receipt.sizeBytes <= 4 * 1024 * 1024 &&
    typeof receipt.fileName === "string" &&
    receipt.fileName.length <= 120
  )
}

export function parseStoredReport(raw: string | null): StoredReport | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (
      value.v !== 1 ||
      typeof value.clientReportId !== "string" ||
      !operationId.test(value.clientReportId) ||
      typeof value.payerName !== "string" ||
      value.payerName.length > 160 ||
      typeof value.claimedAmountMinor !== "number" ||
      !Number.isSafeInteger(value.claimedAmountMinor) ||
      value.claimedAmountMinor <= 0 ||
      value.claimedAmountMinor > 100_000_000 ||
      (value.receipt !== null && !isStoredReceipt(value.receipt)) ||
      (value.reportToken !== null && typeof value.reportToken !== "string") ||
      (value.previousReportToken !== null &&
        typeof value.previousReportToken !== "string") ||
      (value.reportedAt !== null && typeof value.reportedAt !== "string")
    )
      return null
    return value as unknown as StoredReport
  } catch {
    return null
  }
}

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function readStoredReport(linkToken: string) {
  const key = reportStorageKey(linkToken)
  if (visitReports.has(key)) return visitReports.get(key) ?? null
  try {
    const report = parseStoredReport(storage()?.getItem(key) ?? null)
    if (report) visitReports.set(key, report)
    return report
  } catch {
    return null
  }
}

export function hasPersistedReport(
  linkToken: string,
  reportToken: string | null,
) {
  try {
    return Boolean(
      reportToken &&
        parseStoredReport(
          storage()?.getItem(reportStorageKey(linkToken)) ?? null,
        )?.reportToken === reportToken,
    )
  } catch {
    return false
  }
}

export function writeStoredReport(linkToken: string, report: StoredReport) {
  const key = reportStorageKey(linkToken)
  visitReports.set(key, report)
  try {
    storage()?.setItem(key, JSON.stringify(report))
  } catch {
    /* Private mode or a full quota: the page still works for this visit. */
  }
}

export function clearStoredReport(linkToken: string) {
  visitReports.delete(reportStorageKey(linkToken))
  try {
    storage()?.removeItem(reportStorageKey(linkToken))
  } catch {
    /* Nothing to clear. */
  }
}

export function newClientReportId() {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID)
    return `pr_${cryptoApi.randomUUID().replace(/-/g, "")}`
  const bytes = new Uint8Array(16)
  cryptoApi.getRandomValues(bytes)
  return `pr_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

/** Same report details → same clientReportId, so a retry replays instead of conflicting. */
export function sameReportDetails(
  report: StoredReport,
  details: Pick<StoredReport, "payerName" | "claimedAmountMinor" | "receipt">,
) {
  return (
    report.payerName === details.payerName &&
    report.claimedAmountMinor === details.claimedAmountMinor &&
    (report.receipt?.contentDigest ?? null) ===
      (details.receipt?.contentDigest ?? null) &&
    (report.receipt?.contentType ?? null) ===
      (details.receipt?.contentType ?? null) &&
    (report.receipt?.sizeBytes ?? null) === (details.receipt?.sizeBytes ?? null)
  )
}
