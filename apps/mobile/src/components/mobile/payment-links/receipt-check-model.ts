import { formatMinorMoney } from "@ewatrade/utils"

/**
 * The server's advisory receipt check (businessBanking.report
 * `receiptAssessment`). It reads the customer's receipt only; it never
 * confirms that money arrived (`fundsConfirmed` is always false).
 */
export type ReceiptAssessment = {
  state: "pending" | "checking" | "complete" | "unavailable"
  generation: number
  pipelineVersion: string
  completedAt: Date | string | null
  amountMinor: number | null
  currencyCode: string | null
  recipientLast4: string | null
  unavailableReason: string | null
  disposition: "consistent" | "needs_review" | null
  findings: { code: string; severity: "info" | "review" }[]
  fundsConfirmed: false
}

/** Fixed copy per finding code; an unknown code never shows its raw text. */
const FINDING_COPY: Record<string, string> = {
  UNREADABLE: "The receipt couldn't be read.",
  MULTIPLE_TRANSFERS: "The receipt shows more than one transfer.",
  AMOUNT_UNKNOWN: "The amount on the receipt couldn't be read.",
  AMOUNT_MISMATCH:
    "The amount on the receipt is different from what the customer said.",
  CURRENCY_UNKNOWN: "The currency on the receipt couldn't be read.",
  CURRENCY_MISMATCH: "The receipt is in a different currency.",
  RECIPIENT_UNKNOWN: "The receiving account on the receipt couldn't be read.",
  RECIPIENT_MISMATCH: "The receipt shows a different receiving account.",
  DATE_UNKNOWN: "The date on the receipt couldn't be read.",
  DATE_AMBIGUOUS: "The date on the receipt could be read more than one way.",
  DATE_OLD: "The receipt date is older than expected.",
  DATE_FUTURE: "The receipt date is later than expected.",
  PRINTED_STATUS_REVIEW: "The receipt doesn't say the transfer was successful.",
  REFERENCE_MATCHED: "The narration includes the payment reference.",
  REFERENCE_NEEDS_BANK_CHECK:
    "The payment reference wasn't found in the narration.",
  DUPLICATE_CANDIDATE: "A receipt like this was sent for another payment.",
}

const UNAVAILABLE_COPY: Record<string, string> = {
  PDF_MANUAL_REVIEW: "PDF receipts aren't read automatically.",
  ENTITLEMENT_UNAVAILABLE:
    "Receipt checks aren't available for this business right now.",
  SCOPE_UNAVAILABLE:
    "Receipt checks aren't available for this business right now.",
  BUDGET_UNAVAILABLE: "Receipt checks are paused for now.",
}

export const RECEIPT_CHECK_ADVISORY =
  "Receipt checks are advisory. They don't show that money arrived. Check your bank account."

export type ReceiptCheckView = {
  /** Never "success": a consistent receipt is still not a confirmed payment. */
  tone: "muted" | "warning"
  title: string
  message: string
  facts: { label: string; value: string }[]
  findings: { severity: "info" | "review"; text: string }[]
  /** The check may still change, so a manual Refresh helps. */
  inProgress: boolean
}

/** What the merchant sees for a receipt check, or null when there is none. */
export function receiptCheckView(
  assessment: ReceiptAssessment | null | undefined,
): ReceiptCheckView | null {
  if (!assessment) return null
  if (assessment.state === "pending" || assessment.state === "checking")
    return {
      tone: "muted",
      title:
        assessment.state === "pending"
          ? "Receipt check waiting"
          : "Checking the receipt",
      message: `${RECEIPT_CHECK_ADVISORY} You don't need to wait for it.`,
      facts: [],
      findings: [],
      inProgress: true,
    }
  if (assessment.state === "unavailable")
    return {
      tone: "muted",
      title: "Receipt check unavailable",
      message: `${
        UNAVAILABLE_COPY[assessment.unavailableReason ?? ""] ??
        "The receipt couldn't be checked automatically."
      } Open the receipt and check your bank account.`,
      facts: [],
      findings: [],
      inProgress: false,
    }
  const seen = new Set<string>()
  const findings = assessment.findings.flatMap((finding) => {
    if (seen.has(finding.code)) return []
    seen.add(finding.code)
    return [
      {
        severity: finding.severity,
        text:
          FINDING_COPY[finding.code] ??
          (finding.severity === "review"
            ? "Another receipt detail needs a check."
            : "Another receipt detail was noted."),
      },
    ]
  })
  // Review findings first, so the ones to act on lead.
  findings.sort(
    (a, b) =>
      (a.severity === "review" ? 0 : 1) - (b.severity === "review" ? 0 : 1),
  )
  const amount =
    assessment.amountMinor !== null && assessment.currencyCode
      ? formatMinorMoney(assessment.amountMinor, assessment.currencyCode)
      : "Unknown"
  return {
    tone: assessment.disposition === "needs_review" ? "warning" : "muted",
    title:
      assessment.disposition === "consistent"
        ? "Receipt details look consistent"
        : assessment.disposition === "needs_review"
          ? "Receipt details need a closer look"
          : "Receipt checked",
    message: RECEIPT_CHECK_ADVISORY,
    facts: [
      { label: "Amount on receipt", value: amount },
      {
        label: "Receiving account on receipt",
        value: assessment.recipientLast4
          ? `••${assessment.recipientLast4}`
          : "Unknown",
      },
    ],
    findings,
    inProgress: false,
  }
}

/**
 * The private structured reading of the receipt, merchant-only. Every field
 * the reader couldn't find is "Unknown"; the account shows its last 4 digits.
 */
export type ReceiptExtraction = {
  documentKind: "single_transfer" | "multiple_transfers" | "unreadable"
  printedStatus: "successful" | "pending" | "failed" | "reversed" | "unknown"
  amountText: string | null
  currencyCode: string | null
  feeText: string | null
  recipientAccount: string | null
  recipientBank: string | null
  recipientName: string | null
  senderName: string | null
  bankReference: string | null
  narration: string | null
  dateRaw: string | null
}

const PRINTED_STATUS: Record<ReceiptExtraction["printedStatus"], string> = {
  successful: "Successful",
  pending: "Pending",
  failed: "Failed",
  reversed: "Reversed",
  unknown: "Unknown",
}
const DOCUMENT_KIND: Record<ReceiptExtraction["documentKind"], string> = {
  single_transfer: "One transfer",
  multiple_transfers: "More than one transfer",
  unreadable: "Unreadable",
}

export function receiptExtractionFacts(
  extraction: ReceiptExtraction | null | undefined,
) {
  if (!extraction) return null
  const known = (value: string | null) => value?.trim() || "Unknown"
  const digits = extraction.recipientAccount?.replace(/\D/g, "") ?? ""
  return [
    { label: "Receipt shows", value: DOCUMENT_KIND[extraction.documentKind] },
    {
      label: "Amount",
      value: extraction.amountText?.trim()
        ? [extraction.currencyCode?.trim(), extraction.amountText.trim()]
            .filter(Boolean)
            .join(" ")
        : "Unknown",
    },
    { label: "Fee", value: known(extraction.feeText) },
    {
      label: "Status printed",
      value: PRINTED_STATUS[extraction.printedStatus],
    },
    { label: "Paid to", value: known(extraction.recipientName) },
    { label: "Bank", value: known(extraction.recipientBank) },
    {
      label: "Account",
      value: digits.length >= 4 ? `••${digits.slice(-4)}` : "Unknown",
    },
    { label: "Sender", value: known(extraction.senderName) },
    { label: "Bank reference", value: known(extraction.bankReference) },
    { label: "Narration", value: known(extraction.narration) },
    { label: "Date printed", value: known(extraction.dateRaw) },
  ]
}
