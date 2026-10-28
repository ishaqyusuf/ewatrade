import {
  type ReportAllocation,
  isReportAllocation,
  sameAllocation,
} from "./report-allocation"

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

/**
 * A new payment reference requested after a decided report. The clientAttemptId is saved before
 * the request so a lost response or a reload replays the same attempt instead of issuing another.
 */
export type StoredNextAttempt = {
  clientAttemptId: string
  /** Filled from the server's answer; null until one arrives. */
  paymentAttemptId: string | null
  paymentReference: string | null
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
  /**
   * The payment attempt shown when this report was made; every retry is bound to it. Absent on
   * reports saved before references, and null for links that never had one.
   */
  paymentAttemptId?: string | null
  /** The reference shown with that attempt, kept for the unfinished/retry page. */
  paymentReference?: string | null
  /** After this report was decided: the next attempt the customer asked for. */
  nextAttempt?: StoredNextAttempt | null
  /**
   * The allocation proposal sent with a larger amount; part of the same idempotent report.
   * Never refund bank details: those are not kept in browser storage.
   */
  allocation?: ReportAllocation | null
  /**
   * True when this report's refund request carries bank details. Only this flag is kept: the
   * details are re-entered to recover an unknown prepare or replace a report after a reload.
   * A saved server proof can submit the existing sealed destination without resending it.
   */
  refundDetails?: boolean
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

/** A per-link browser key that never contains the raw link token. */
export function linkScopedKey(prefix: string, linkToken: string) {
  return `${prefix}${fnv1a(linkToken, 0x811c9dc5)}${fnv1a(linkToken, 0x9e3779b9)}`
}

export function reportStorageKey(linkToken: string) {
  return linkScopedKey(KEY_PREFIX, linkToken)
}

const operationId = /^[a-zA-Z0-9_-]{8,120}$/
const digest = /^[a-f0-9]{64}$/
const recordId = /^[a-zA-Z0-9_-]{1,128}$/
const reference = /^[A-Z0-9-]{1,64}$/

/** Absent (older records) or null are allowed; anything present must be well formed. */
function optional(value: unknown, pattern: RegExp) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && pattern.test(value))
  )
}

function isStoredNextAttempt(value: unknown): value is StoredNextAttempt {
  if (!value || typeof value !== "object") return false
  const attempt = value as Record<string, unknown>
  return (
    typeof attempt.clientAttemptId === "string" &&
    operationId.test(attempt.clientAttemptId) &&
    attempt.paymentAttemptId !== undefined &&
    attempt.paymentReference !== undefined &&
    optional(attempt.paymentAttemptId, recordId) &&
    optional(attempt.paymentReference, reference) &&
    // An issued attempt always arrives with its reference.
    (attempt.paymentAttemptId === null) === (attempt.paymentReference === null)
  )
}

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
      (value.reportedAt !== null && typeof value.reportedAt !== "string") ||
      !optional(value.paymentAttemptId, recordId) ||
      !optional(value.paymentReference, reference) ||
      (value.allocation !== undefined &&
        value.allocation !== null &&
        !isReportAllocation(value.allocation)) ||
      (value.refundDetails !== undefined &&
        value.refundDetails !== false &&
        // Bank details belong only to a refund request.
        (value.refundDetails !== true ||
          !isReportAllocation(value.allocation) ||
          value.allocation.allocationPreference !== "REFUND")) ||
      (value.nextAttempt !== undefined &&
        value.nextAttempt !== null &&
        // Only a report with its own proof can ask for the next attempt.
        (typeof value.reportToken !== "string" ||
          !isStoredNextAttempt(value.nextAttempt)))
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

export function newOperationId(prefix: string) {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID)
    return `${prefix}_${cryptoApi.randomUUID().replace(/-/g, "")}`
  const bytes = new Uint8Array(16)
  cryptoApi.getRandomValues(bytes)
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

export function newClientReportId() {
  return newOperationId("pr")
}

export function newClientAttemptId() {
  return newOperationId("pa")
}

/**
 * Same report details and the same shown payment attempt → same clientReportId, so a retry
 * replays instead of conflicting. Refund bank details are compared by the caller in memory. A different attempt is a different report. A record saved
 * before attempts existed is unbound: retrying it unchanged lets the server replay what it saved.
 */
export function sameReportDetails(
  report: StoredReport,
  details: Pick<
    StoredReport,
    "payerName" | "claimedAmountMinor" | "receipt"
  > & {
    paymentAttemptId: string | null
    allocation?: ReportAllocation | null
    refundDetails?: boolean
  },
) {
  return (
    sameAllocation(report.allocation, details.allocation) &&
    Boolean(report.refundDetails) === Boolean(details.refundDetails) &&
    (report.paymentAttemptId === undefined ||
      report.paymentAttemptId === details.paymentAttemptId) &&
    report.payerName === details.payerName &&
    report.claimedAmountMinor === details.claimedAmountMinor &&
    (report.receipt?.contentDigest ?? null) ===
      (details.receipt?.contentDigest ?? null) &&
    (report.receipt?.contentType ?? null) ===
      (details.receipt?.contentType ?? null) &&
    (report.receipt?.sizeBytes ?? null) === (details.receipt?.sizeBytes ?? null)
  )
}
