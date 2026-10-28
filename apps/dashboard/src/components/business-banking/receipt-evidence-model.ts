import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

/**
 * Merchant words for the saved receipt check (MB-01). A receipt check is
 * evidence for the person checking their bank, never proof that money
 * arrived: nothing here confirms, fills in or attests a payment.
 */

type MerchantReport = RouterOutputs["businessBanking"]["report"]
export type ReceiptAssessment = NonNullable<MerchantReport["receiptAssessment"]>
export type ReceiptExtraction = NonNullable<MerchantReport["receiptExtraction"]>

const RECEIPT_POLL_MS = 3_000
const RECEIPT_POLL_LIMIT_MS = 60_000

/** One bounded wait for a saved check; checking progress doesn't restart it. */
export function receiptCheckPoll(input: {
  state: ReceiptAssessment["state"] | undefined
  startedAt: number | null
  now: number
  visible: boolean
  failed: boolean
}): { startedAt: number | null; interval: number | false } {
  if (input.state !== "pending" && input.state !== "checking")
    return { startedAt: null, interval: false }
  const startedAt = input.startedAt ?? input.now
  const remaining = RECEIPT_POLL_LIMIT_MS - (input.now - startedAt)
  return {
    startedAt,
    interval:
      input.visible && !input.failed && remaining > 0
        ? Math.min(RECEIPT_POLL_MS, remaining)
        : false,
  }
}

const FINDING_WORDS: Record<string, string> = {
  UNREADABLE: "The receipt couldn’t be read.",
  MULTIPLE_TRANSFERS: "The receipt shows more than one transfer.",
  AMOUNT_UNKNOWN: "No amount could be read.",
  AMOUNT_MISMATCH: "The amount differs from what the customer said.",
  CURRENCY_UNKNOWN: "No currency could be read.",
  CURRENCY_MISMATCH: "The currency differs from this payment.",
  RECIPIENT_UNKNOWN: "The receiving account couldn’t be read.",
  RECIPIENT_MISMATCH: "The receiving account differs from the link’s account.",
  DATE_UNKNOWN: "No transfer date could be read.",
  DATE_AMBIGUOUS: "The date could be read two ways.",
  DATE_OLD: "The transfer date is older than this payment request.",
  DATE_FUTURE: "The transfer date is in the future.",
  PRINTED_STATUS_REVIEW: "The receipt doesn’t show the transfer as successful.",
  REFERENCE_MATCHED: "The payment reference appears on the receipt.",
  REFERENCE_NEEDS_BANK_CHECK: "The payment reference wasn’t found on it.",
  DUPLICATE_CANDIDATE: "This receipt looks like one used before.",
}

/** One finding in plain words; an unknown code still asks for a check. */
export function receiptFindingWords(code: string) {
  return FINDING_WORDS[code] ?? "Another detail on the receipt needs a check."
}

export type ReceiptCheckSummary = {
  tone: "info" | "review"
  title: string
  detail: string
}

/**
 * The headline for the saved check. Missing, waiting or unavailable checks
 * all fall back to checking the bank directly; a consistent receipt still
 * says it doesn't confirm money arrived.
 */
export function receiptCheckSummary(
  assessment: Pick<
    ReceiptAssessment,
    "state" | "disposition" | "unavailableReason"
  > | null,
  hasReceipt: boolean,
): ReceiptCheckSummary | null {
  if (!hasReceipt) return null
  const bank = "Check your bank account directly."
  if (!assessment)
    return {
      tone: "info",
      title: "Receipt not checked automatically",
      detail: `Open it and compare it with your bank app. ${bank}`,
    }
  if (assessment.state === "pending" || assessment.state === "checking")
    return {
      tone: "info",
      title: "Checking the receipt",
      detail: `You don’t need to wait. ${bank}`,
    }
  if (assessment.state === "unavailable")
    return {
      tone: "info",
      title: "Receipt check unavailable",
      detail:
        assessment.unavailableReason === "PDF_MANUAL_REVIEW"
          ? `PDF receipts aren’t checked automatically. ${bank}`
          : `Open the receipt yourself. ${bank}`,
    }
  if (assessment.disposition === "consistent")
    return {
      tone: "info",
      title: "Receipt details look consistent",
      detail: "This doesn’t confirm the money arrived. Check your bank.",
    }
  return {
    tone: "review",
    title: "Receipt needs a closer look",
    detail:
      assessment.disposition === "needs_review"
        ? `Some details don’t line up. ${bank}`
        : `The check has no clear result. ${bank}`,
  }
}

const PRINTED_STATUS_WORDS: Record<string, string> = {
  successful: "Successful",
  pending: "Pending",
  failed: "Failed",
  reversed: "Reversed",
  unknown: "Not shown",
}

/**
 * What the receipt itself shows, as read. Only fields that were read are
 * listed; nothing is copied into the bank check.
 */
export function receiptExtractionRows(extraction: ReceiptExtraction) {
  const join = (...parts: Array<string | null>) =>
    parts.filter((part): part is string => Boolean(part)).join(" · ") || null
  const rows: Array<[string, string | null]> = [
    ["Amount", join(extraction.amountText, extraction.currencyCode)],
    ["Fee", extraction.feeText],
    ["Total debited", extraction.totalDebitText],
    [
      "To",
      join(
        extraction.recipientBank,
        extraction.recipientName,
        extraction.recipientAccount,
      ),
    ],
    ["From", extraction.senderName],
    [
      "Date",
      extraction.dateRaw
        ? `${extraction.dateRaw}${extraction.dateAmbiguous ? " (day and month unclear)" : ""}`
        : null,
    ],
    [
      "Status printed",
      PRINTED_STATUS_WORDS[extraction.printedStatus] ?? "Not shown",
    ],
    ["Bank reference", extraction.bankReference],
    ["Narration", extraction.narration],
  ]
  return rows.filter((row): row is [string, string] => row[1] !== null)
}

// The server only re-queues these; others (like PDFs) stay a manual check.
const RETRYABLE_REASONS = new Set([
  "PROCESSOR_UNAVAILABLE",
  "WORKER_UNAVAILABLE",
  "ENTITLEMENT_UNAVAILABLE",
  "SCOPE_UNAVAILABLE",
])

/**
 * Whether "Check the receipt again" is worth offering. It asks the existing
 * check to run again; the server still decides, and the saved result is
 * what's shown afterwards.
 */
export function receiptRetryOffered(
  assessment: Pick<ReceiptAssessment, "state" | "unavailableReason"> | null,
  hasReceipt: boolean,
) {
  if (!hasReceipt) return false
  if (!assessment) return true
  return (
    assessment.state === "unavailable" &&
    RETRYABLE_REASONS.has(assessment.unavailableReason ?? "")
  )
}
