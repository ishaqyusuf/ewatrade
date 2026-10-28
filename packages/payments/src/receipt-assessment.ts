import { paymentReferenceMatches } from "./manual-payment-reference"

export const RECEIPT_PIPELINE_VERSION = "manual-receipt-v1"
export const RECEIPT_RULE_VERSION = "manual-receipt-rules-v1"
export const RECEIPT_TEXT_FIELDS = [
  "amountText",
  "currencyCode",
  "feeText",
  "totalDebitText",
  "recipientAccount",
  "recipientBank",
  "recipientName",
  "senderName",
  "bankReference",
  "narration",
  "dateRaw",
  "dateTimeIso",
  "dateOnly",
  "timezone",
] as const
export type ReceiptTextField = (typeof RECEIPT_TEXT_FIELDS)[number]
export type ReceiptExtraction = Record<ReceiptTextField, string | null> & {
  documentKind: "single_transfer" | "multiple_transfers" | "unreadable"
  printedStatus: "successful" | "pending" | "failed" | "reversed" | "unknown"
  dateAmbiguous: boolean
  evidence: { field: ReceiptTextField; page: number; text: string }[]
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid receipt extraction.")
  return value as Record<string, unknown>
}
const member = <T extends string>(value: unknown, allowed: readonly T[]): T => {
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw new Error("Invalid receipt extraction field.")
  return value as T
}
const safeText = (value: unknown, max = 500): string | null => {
  if (value === null) return null
  if (
    typeof value !== "string" ||
    value.length > max ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return code === 127 || code < 9 || (code > 10 && code < 32)
    })
  )
    throw new Error("Invalid receipt extraction text.")
  return value.trim() || null
}

/** Provider output is untrusted data, even when structured output was requested. */
export function parseReceiptExtraction(value: unknown): ReceiptExtraction {
  const row = object(value)
  const allowed = [
    ...RECEIPT_TEXT_FIELDS,
    "documentKind",
    "printedStatus",
    "dateAmbiguous",
    "evidence",
  ]
  if (
    Object.keys(row).some((key) => !allowed.includes(key)) ||
    typeof row.dateAmbiguous !== "boolean" ||
    !Array.isArray(row.evidence) ||
    row.evidence.length > 40
  )
    throw new Error("Invalid receipt extraction shape.")
  const fields = Object.fromEntries(
    RECEIPT_TEXT_FIELDS.map((key) => [key, safeText(row[key])]),
  ) as Record<ReceiptTextField, string | null>
  return {
    ...fields,
    documentKind: member(row.documentKind, [
      "single_transfer",
      "multiple_transfers",
      "unreadable",
    ]),
    printedStatus: member(row.printedStatus, [
      "successful",
      "pending",
      "failed",
      "reversed",
      "unknown",
    ]),
    dateAmbiguous: row.dateAmbiguous,
    evidence: row.evidence.map((value) => {
      const evidence = object(value)
      if (
        Object.keys(evidence).some(
          (key) => !["field", "page", "text"].includes(key),
        ) ||
        typeof evidence.page !== "number" ||
        !Number.isInteger(evidence.page) ||
        evidence.page < 1 ||
        evidence.page > 3
      )
        throw new Error("Invalid receipt evidence.")
      const text = safeText(evidence.text)
      if (!text) throw new Error("Missing receipt evidence.")
      return {
        field: member(evidence.field, RECEIPT_TEXT_FIELDS),
        page: evidence.page,
        text,
      }
    }),
  }
}

/** Parse the transfer amount only; fees/debit/balance never substitute for it. */
export function receiptAmountMinor(text: string | null): number | null {
  if (
    !text ||
    !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text) ||
    text.length > 30
  )
    return null
  const [whole = "", fraction = ""] = text.replace(/,/g, "").split(".")
  const amount = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))
  return amount > BigInt(0) && amount <= BigInt(100_000_000)
    ? Number(amount)
    : null
}

export type ReceiptFinding = {
  code:
    | "UNREADABLE"
    | "MULTIPLE_TRANSFERS"
    | "AMOUNT_UNKNOWN"
    | "AMOUNT_MISMATCH"
    | "CURRENCY_UNKNOWN"
    | "CURRENCY_MISMATCH"
    | "RECIPIENT_UNKNOWN"
    | "RECIPIENT_MISMATCH"
    | "DATE_UNKNOWN"
    | "DATE_AMBIGUOUS"
    | "DATE_OLD"
    | "DATE_FUTURE"
    | "PRINTED_STATUS_REVIEW"
    | "REFERENCE_MATCHED"
    | "REFERENCE_NEEDS_BANK_CHECK"
    | "DUPLICATE_CANDIDATE"
  severity: "info" | "review"
  observed: string | number | null
  expected: string | number | null
}
export type ReceiptCheckContext = {
  claimedAmountMinor: number
  currencyCode: string
  receivingAccountNumber: string
  paymentReference: string | null
  claimedAt: Date
  // Explicit caller policy, never hidden production thresholds.
  oldestAcceptableAt: Date
  latestAcceptableAt: Date
  duplicateCandidate: boolean
}

/** Evidence only: this result is never accepted by a financial command. */
export function assessManualPaymentReceipt(
  extraction: ReceiptExtraction,
  context: ReceiptCheckContext,
) {
  if (
    !Number.isSafeInteger(context.claimedAmountMinor) ||
    context.claimedAmountMinor <= 0 ||
    ![
      context.claimedAt,
      context.oldestAcceptableAt,
      context.latestAcceptableAt,
    ].every((value) => Number.isFinite(value.getTime())) ||
    context.oldestAcceptableAt > context.latestAcceptableAt
  )
    throw new Error("Invalid receipt check context.")
  const findings: ReceiptFinding[] = []
  const add = (
    code: ReceiptFinding["code"],
    observed: ReceiptFinding["observed"] = null,
    expected: ReceiptFinding["expected"] = null,
    severity: ReceiptFinding["severity"] = "review",
  ) => findings.push({ code, severity, observed, expected })
  if (extraction.documentKind !== "single_transfer")
    add(
      extraction.documentKind === "unreadable"
        ? "UNREADABLE"
        : "MULTIPLE_TRANSFERS",
    )
  const amountMinor = receiptAmountMinor(extraction.amountText)
  if (amountMinor === null) add("AMOUNT_UNKNOWN")
  else if (amountMinor !== context.claimedAmountMinor)
    add("AMOUNT_MISMATCH", amountMinor, context.claimedAmountMinor)
  if (!extraction.currencyCode || !/^[A-Z]{3}$/.test(extraction.currencyCode))
    add("CURRENCY_UNKNOWN")
  else if (extraction.currencyCode !== context.currencyCode)
    add("CURRENCY_MISMATCH", extraction.currencyCode, context.currencyCode)
  // Only a complete, unmasked ten-digit account can establish an exact mismatch.
  const account = extraction.recipientAccount?.replace(/\s/g, "")
  if (!account || !/^\d{10}$/.test(account)) add("RECIPIENT_UNKNOWN")
  else if (account !== context.receivingAccountNumber)
    add(
      "RECIPIENT_MISMATCH",
      account.slice(-4),
      context.receivingAccountNumber.slice(-4),
    )
  if (extraction.dateAmbiguous) add("DATE_AMBIGUOUS", extraction.dateRaw)
  else if (
    extraction.dateTimeIso &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      extraction.dateTimeIso,
    )
  ) {
    const time = new Date(extraction.dateTimeIso)
    if (!Number.isFinite(time.getTime())) add("DATE_UNKNOWN")
    else if (time < context.oldestAcceptableAt)
      add(
        "DATE_OLD",
        extraction.dateTimeIso,
        context.oldestAcceptableAt.toISOString(),
      )
    else if (time > context.latestAcceptableAt)
      add(
        "DATE_FUTURE",
        extraction.dateTimeIso,
        context.latestAcceptableAt.toISOString(),
      )
  } else add("DATE_UNKNOWN", extraction.dateRaw)
  if (extraction.printedStatus !== "successful")
    add("PRINTED_STATUS_REVIEW", extraction.printedStatus)
  if (context.paymentReference) {
    const matched =
      extraction.narration &&
      paymentReferenceMatches(context.paymentReference, extraction.narration)
    add(
      matched ? "REFERENCE_MATCHED" : "REFERENCE_NEEDS_BANK_CHECK",
      null,
      null,
      matched ? "info" : "review",
    )
  }
  if (context.duplicateCandidate) add("DUPLICATE_CANDIDATE")
  return {
    state: "complete" as const,
    disposition: findings.some((finding) => finding.severity === "review")
      ? ("needs_review" as const)
      : ("consistent" as const),
    ruleVersion: RECEIPT_RULE_VERSION,
    amountMinor,
    findings,
    fundsConfirmed: false as const,
  }
}
