import { type PublicReportStatus, lastDigits, money } from "./payment-format"
import { MAX_REPORT_MINOR } from "./report-allocation"

export type ReceiptAssessment = NonNullable<
  PublicReportStatus["receiptAssessment"]
>

export type ReceiptCheckTone = "info" | "wait" | "warn"

export type ReceiptCheckView = {
  tone: ReceiptCheckTone
  title: string
  body: string
  /** Each item is one bounded server finding the customer should know about. */
  points: string[]
  /** Only when the server can queue the same receipt check again. */
  canRetry: boolean
}

// The server requeues only these, and only before any provider call started.
const RETRYABLE_REASONS = new Set([
  "PROCESSOR_UNAVAILABLE",
  "WORKER_UNAVAILABLE",
  "ENTITLEMENT_UNAVAILABLE",
  "SCOPE_UNAVAILABLE",
])

// Most important first; unknown future codes fall to the end.
const FINDING_ORDER = [
  "DUPLICATE_CANDIDATE",
  "UNREADABLE",
  "MULTIPLE_TRANSFERS",
  "AMOUNT_MISMATCH",
  "RECIPIENT_MISMATCH",
  "CURRENCY_MISMATCH",
  "DATE_OLD",
  "DATE_FUTURE",
  "PRINTED_STATUS_REVIEW",
  "AMOUNT_UNKNOWN",
  "RECIPIENT_UNKNOWN",
  "CURRENCY_UNKNOWN",
  "DATE_UNKNOWN",
  "DATE_AMBIGUOUS",
  "REFERENCE_NEEDS_BANK_CHECK",
]

function rank(code: string) {
  const index = FINDING_ORDER.indexOf(code)
  return index === -1 ? FINDING_ORDER.length : index
}

function findingText(
  code: string,
  input: {
    assessment: ReceiptAssessment
    claimedAmountMinor: number
    currencyCode: string
    accountNumber: string
  },
) {
  const { assessment } = input
  // Extracted values are shown only when the server sent them in this currency.
  const receiptAmount =
    assessment.amountMinor !== null &&
    assessment.currencyCode === input.currencyCode
      ? money(assessment.amountMinor, input.currencyCode)
      : null
  const claimed = money(input.claimedAmountMinor, input.currencyCode)
  switch (code) {
    case "DUPLICATE_CANDIDATE":
      return "This receipt may have been used for another payment. A transfer can only pay once, so they will check it by hand."
    case "UNREADABLE":
      return "The receipt couldn't be read."
    case "MULTIPLE_TRANSFERS":
      return "The receipt seems to show more than one transfer."
    case "AMOUNT_MISMATCH":
      return receiptAmount
        ? `The receipt shows ${receiptAmount}. You said ${claimed}.`
        : `The receipt amount doesn't match the ${claimed} you said.`
    case "RECIPIENT_MISMATCH":
      return assessment.recipientLast4
        ? `The receipt shows an account ending ${assessment.recipientLast4}. This page's account ends ${input.accountNumber.slice(-4)}.`
        : `The receipt shows a different account from ${lastDigits(input.accountNumber)}.`
    case "CURRENCY_MISMATCH":
      return `The receipt isn't in ${input.currencyCode}.`
    case "DATE_OLD":
      // The server's date window, not necessarily before this request was made.
      return "The receipt date is older than expected, so the date needs checking."
    case "DATE_FUTURE":
      return "The receipt date is later than expected."
    case "PRINTED_STATUS_REVIEW":
      return "The receipt doesn't clearly say the transfer was successful."
    case "AMOUNT_UNKNOWN":
      return "The amount couldn't be read."
    case "RECIPIENT_UNKNOWN":
      return "The receiving account couldn't be read in full."
    case "CURRENCY_UNKNOWN":
      return "The currency couldn't be read."
    case "DATE_UNKNOWN":
    case "DATE_AMBIGUOUS":
      return "The date couldn't be read clearly."
    case "REFERENCE_NEEDS_BANK_CHECK":
      return "The payment reference wasn't found on the receipt."
    default:
      return "Something on the receipt needs a check."
  }
}

/**
 * Before the final submit (a DRAFT) the check is advice the customer can act on; after it, the
 * report is with the business. Both say the business still checks its bank account.
 */
export type ReceiptCheckStage = "draft" | "submitted"

/**
 * What the customer sees about the automatic receipt check. It is supporting evidence only:
 * every state, including "consistent", says the business still checks its bank account, and
 * nothing here reads as payment confirmed. Null (no check recorded) is not a passed check.
 * timedOut: the page stopped waiting for a draft check, which never decides anything itself.
 */
export function receiptCheckView(input: {
  assessment: ReceiptAssessment | null
  hasReceipt: boolean
  businessName: string
  claimedAmountMinor: number
  currencyCode: string
  accountNumber: string
  stage?: ReceiptCheckStage
  timedOut?: boolean
}): ReceiptCheckView | null {
  const { assessment, businessName } = input
  const draft = input.stage === "draft"
  if (!input.hasReceipt && !assessment) return null
  const running =
    !assessment ||
    assessment.state === "pending" ||
    assessment.state === "checking"
  if (draft && running)
    return input.timedOut
      ? {
          tone: "info",
          title: "Receipt check is taking too long",
          body: `You can send your report now. ${businessName} checks their bank account directly.`,
          points: [],
          canRetry: false,
        }
      : {
          tone: "wait",
          title: "Checking your receipt",
          body: "Reading the amount, account and date. Nothing is sent until you say you've paid.",
          points: [],
          canRetry: false,
        }
  if (!assessment)
    return {
      tone: "info",
      title: "Receipt sent",
      body: `${businessName} can look at it while they check their account.`,
      points: [],
      canRetry: false,
    }
  if (assessment.state === "pending" || assessment.state === "checking")
    return {
      tone: "wait",
      title: "Checking your receipt",
      body: "Reading the amount, account and date. This doesn't change your report.",
      points: [],
      canRetry: false,
    }
  if (assessment.state === "unavailable")
    return {
      tone: "info",
      title:
        assessment.unavailableReason === "PDF_MANUAL_REVIEW"
          ? draft
            ? "This receipt needs a manual check"
            : "Receipt sent for a manual check"
          : "Receipt check unavailable",
      body: draft
        ? `You can still send it. ${businessName} will look at your receipt and check their bank account directly.`
        : `${businessName} will look at your receipt and check their bank account directly.`,
      points: [],
      canRetry: RETRYABLE_REASONS.has(assessment.unavailableReason ?? ""),
    }
  const review = assessment.findings
    .filter((finding) => finding.severity === "review")
    .map((finding) => finding.code)
  const codes = [...new Set(review)].sort((a, b) => rank(a) - rank(b))
  if (assessment.disposition === "consistent" && codes.length === 0) {
    const shown = [
      assessment.amountMinor !== null &&
      assessment.currencyCode === input.currencyCode
        ? money(assessment.amountMinor, input.currencyCode)
        : null,
      assessment.recipientLast4
        ? `to an account ending ${assessment.recipientLast4}`
        : null,
    ].filter(Boolean)
    return {
      tone: "info",
      title: "Receipt details look consistent",
      body: `${shown.length ? `The receipt shows ${shown.join(" ")}. ` : ""}This doesn't confirm the money arrived. ${businessName} still checks their account.`,
      points: [],
      canRetry: false,
    }
  }
  return {
    tone: "warn",
    title: draft
      ? "Some receipt details need a check"
      : `${businessName} will check your receipt by hand`,
    body: draft
      ? `Check what you entered. If it's right, you can still send it and ${businessName} will check by hand.`
      : "If you sent a different amount or to another account, reply to them where you got this link.",
    points: (codes.length ? codes : ["UNKNOWN"]).map((code) =>
      findingText(code, { ...input, assessment }),
    ),
    canRetry: false,
  }
}

/**
 * The amount read from the receipt, offered only as an explicit "Use receipt amount" choice: a
 * finished check in this link's currency, a positive bounded whole amount, and different from
 * what the customer entered. It changes the customer's claim only when they choose it.
 */
export function receiptAmountSuggestion(input: {
  assessment: ReceiptAssessment | null
  currencyCode: string
  claimedAmountMinor: number
}) {
  const { assessment } = input
  if (
    assessment?.state !== "complete" ||
    assessment.currencyCode !== input.currencyCode
  )
    return null
  const amount = assessment.amountMinor
  if (
    amount === null ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > MAX_REPORT_MINOR ||
    amount === input.claimedAmountMinor
  )
    return null
  return amount
}
