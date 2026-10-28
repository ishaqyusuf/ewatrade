import { eligibleLedgerMoneyAccounts } from "@/lib/customer-ledger/command-input"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import type { StatusPillTone } from "../green-till/kit"
import type { LedgerAccount, LedgerMoneyAccount, LedgerSource } from "./types"

export type RefundListItem =
  RouterOutputs["customerLedger"]["refundRequests"]["requests"][number]
export type RefundDetail =
  RouterOutputs["customerLedger"]["refundRequestDetail"]
type Inputs = RouterInputs["customerLedger"]
export type RefundCommand =
  | {
      operation: "requestRefund"
      payload: Omit<Inputs["requestRefund"], "clientCommandId">
    }
  | {
      operation: "reserveRefund"
      payload: Omit<Inputs["reserveRefund"], "clientCommandId">
    }
  | {
      operation: "cancelRefund"
      payload: Omit<Inputs["cancelRefund"], "clientCommandId">
    }
  | {
      operation: "requestRefundDetails"
      payload: Omit<Inputs["requestRefundDetails"], "clientCommandId">
    }
  | {
      operation: "completeRefund"
      // z.coerce.date() inputs are `unknown`; the reviewed value is an exact Date.
      payload: Omit<
        Inputs["completeRefund"],
        "clientCommandId" | "effectiveAt"
      > & { effectiveAt: Date }
    }
export type RefundLifecycleCommand = Exclude<
  RefundCommand,
  { operation: "requestRefund" }
>

const operationLabels: Record<string, string> = {
  requestRefund: "refund request",
  reserveRefund: "refund approval",
  cancelRefund: "refund cancellation",
  requestRefundDetails: "request for more details",
  completeRefund: "refund return record",
  recordOpening: "opening balance",
  recordReceipt: "payment record",
  applyCredit: "credit application",
  releaseAllocation: "allocation release",
  refundUnusedCredit: "credit return",
  reverseEntry: "correction",
}
export function refundOperationLabel(operation: string) {
  return operationLabels[operation] ?? "customer record"
}

export const refundStatusFilters = [
  { value: undefined, label: "All" },
  { value: "REQUESTED", label: "Requested" },
  { value: "RESERVED", label: "Reserved" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const
export type RefundStatusFilter = (typeof refundStatusFilters)[number]["value"]

/** Server status only; an unknown value is shown as-is, never upgraded. */
export function refundStatusInfo(status: string): {
  label: string
  tone: StatusPillTone
  summary: string
} {
  switch (status) {
    case "REQUESTED":
      return {
        label: "Requested",
        tone: "info",
        summary:
          "Not approved yet. Nothing is held, so this credit can still be used.",
      }
    case "RESERVED":
      return {
        label: "Reserved",
        tone: "warn",
        summary:
          "Approved and held. It can't be used on an Order. No money has been sent.",
      }
    case "COMPLETED":
      return {
        label: "Completed",
        tone: "ok",
        summary: "Recorded as returned from your bank. EwaTrade sent nothing.",
      }
    case "CANCELLED":
      return {
        label: "Cancelled",
        tone: "muted",
        summary: "Closed without a return. Any hold was released.",
      }
    default:
      return {
        label: status,
        tone: "muted",
        summary: "Unrecognised refund state. Refresh before acting on it.",
      }
  }
}

/**
 * The server's `reviewState` refines a REQUESTED refund only. Any other saved
 * status wins, so a stale details note can never relabel a reserved refund.
 */
export function refundStateInfo(
  request: Pick<RefundListItem, "status" | "reviewState">,
): ReturnType<typeof refundStatusInfo> {
  if (request.status === "REQUESTED" && request.reviewState === "NEEDS_DETAILS")
    return {
      label: "More details needed",
      tone: "warn",
      summary:
        "Not approved yet. Nothing is held, so this credit can still be used.",
    }
  return refundStatusInfo(request.status)
}

export function refundTime(value: string | Date) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const by = (name: string | null) => (name?.trim() ? ` · ${name.trim()}` : "")

/** Lifecycle provenance strictly from saved server timestamps and names. */
export function refundHistory(
  request: Pick<
    RefundListItem,
    | "status"
    | "createdAt"
    | "approvedAt"
    | "completedAt"
    | "cancelledAt"
    | "outgoingReference"
    | "requestedByName"
    | "approvedByName"
    | "completedByName"
    | "cancelledByName"
    | "reviewState"
    | "reviewedAt"
    | "reviewedByName"
  >,
) {
  const rows: { key: string; label: string; value: string }[] = [
    {
      key: "requested",
      label: "Requested",
      value: `${refundTime(request.createdAt)}${by(request.requestedByName)}`,
    },
  ]
  if (
    request.status === "REQUESTED" &&
    request.reviewState === "NEEDS_DETAILS" &&
    request.reviewedAt
  )
    rows.push({
      key: "details",
      label: "More details requested",
      value: `${refundTime(request.reviewedAt)}${by(request.reviewedByName)}`,
    })
  if (request.approvedAt)
    rows.push({
      key: "reserved",
      label: "Approved and reserved",
      value: `${refundTime(request.approvedAt)}${by(request.approvedByName)}`,
    })
  if (request.completedAt)
    rows.push({
      key: "completed",
      label: "Return recorded",
      value: `${refundTime(request.completedAt)}${request.outgoingReference ? ` · ${request.outgoingReference}` : ""}${by(request.completedByName)}`,
    })
  if (request.cancelledAt)
    rows.push({
      key: "cancelled",
      label: "Cancelled",
      value: `${refundTime(request.cancelledAt)}${by(request.cancelledByName)}`,
    })
  return rows
}

/** The saved destination, or null when the server couldn't open it. */
export function refundDestination(
  detail: Pick<RefundDetail, "destination" | "destinationStatus">,
) {
  return detail.destinationStatus === "AVAILABLE" && detail.destination
    ? detail.destination
    : null
}

/** Credit kinds the server accepts as a refund source (funds-refunds reviewSource). */
const refundableKinds = ["RECEIPT", "OPENING_CREDIT"]
export function refundableSources(sources: LedgerSource[] = []) {
  return sources.filter(
    (s) =>
      s.side === "CREDIT" &&
      refundableKinds.includes(s.kind) &&
      BigInt(s.remainingAmountMinor) > 0n,
  )
}

/** Saved bank name first; an older request may only have its short code. */
export function refundBankLabel(
  destination: { bankName?: string; bankCode?: string } | null | undefined,
) {
  return destination?.bankName?.trim() || destination?.bankCode?.trim() || null
}

/** "Bank · account number", leaving out a bank the request never saved. */
export function refundDestinationLabel(
  destination: NonNullable<ReturnType<typeof refundDestination>>,
) {
  const bank = refundBankLabel(destination)
  return bank
    ? `${bank} · ${destination.accountNumber}`
    : destination.accountNumber
}

export type RefundRequestFields = {
  creditEntryId: string
  amount: string
  reason: string
  bankName: string
  /**
   * Exact retry only: an unconfirmed earlier request saved the bank as a short
   * code. Sent only when entered; never derived from the bank name.
   */
  legacyBankCode?: string
  accountNumber: string
  accountName: string
  revision: string
}

const revisionPattern = /^(0|[1-9]\d{0,18})$/
const bankCodePattern = /^[A-Za-z0-9_-]{1,32}$/
const accountNumberPattern = /^[A-Za-z0-9]{6,34}$/
const printable = (value: string) =>
  Array.from(value).every(
    (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
  )

/** The bank as entered: a name, or an earlier request's exact code. */
function refundBank(fields: RefundRequestFields) {
  const bankName = fields.bankName.trim()
  const bankCode = fields.legacyBankCode?.trim() ?? ""
  if (bankCode) {
    if (bankName)
      throw new Error(
        "Use either the bank name or the earlier bank code, not both.",
      )
    if (!bankCodePattern.test(bankCode))
      throw new Error(
        "Enter the earlier bank code exactly: letters, numbers, - or _.",
      )
    return { bankCode }
  }
  if (!bankName) throw new Error("Enter the bank name.")
  if (bankName.length < 2 || bankName.length > 120 || !printable(bankName))
    throw new Error("Enter the bank name in 2–120 characters.")
  return { bankName }
}

/** Mirrors customerFundsRefundRequestSchema; the server rechecks everything. */
export function prepareRefundRequest({
  account,
  fields,
  sources,
}: {
  account: LedgerAccount
  fields: RefundRequestFields
  sources: LedgerSource[] | undefined
}): Extract<RefundCommand, { operation: "requestRefund" }> {
  if (!account.book) throw new Error("A matching currency book is required.")
  if (!revisionPattern.test(fields.revision))
    throw new Error("Keep the exact reviewed revision.")
  const source = refundableSources(sources).find(
    (s) => s.id === fields.creditEntryId,
  )
  if (!source) throw new Error("Choose the payment or credit being returned.")
  const amountMinor = parseFinanceMoney(fields.amount)
  if (BigInt(amountMinor) > BigInt(source.remainingAmountMinor))
    throw new Error("Enter an amount within the source's available credit.")
  const reason = fields.reason.trim()
  if (!reason || reason.length > 400)
    throw new Error("Enter why this credit is being returned.")
  const destination = {
    ...refundBank(fields),
    accountNumber: fields.accountNumber.replace(/\s+/g, ""),
    accountName: fields.accountName.trim(),
  }
  if (!accountNumberPattern.test(destination.accountNumber))
    throw new Error("Enter the account number using 6–34 letters or digits.")
  if (
    destination.accountName.length < 2 ||
    destination.accountName.length > 160 ||
    !printable(destination.accountName)
  )
    throw new Error("Enter the account holder's name as the bank shows it.")
  return {
    operation: "requestRefund",
    payload: {
      bookId: account.book.id,
      accountId: account.id,
      expectedRevision: fields.revision,
      creditEntryId: source.id,
      amountMinor,
      reason,
      destination,
    },
  }
}

/** The detail must belong to the open account and its book before any write. */
function assertScope(
  detail: RefundDetail,
  account: LedgerAccount,
): asserts account is LedgerAccount & {
  book: NonNullable<LedgerAccount["book"]>
} {
  if (
    !account.book ||
    detail.accountId !== account.id ||
    detail.bookId !== account.book.id ||
    detail.currencyCode !== account.currencyCode
  )
    throw new Error("This refund belongs to a different customer account.")
}

function changePayload(
  detail: RefundDetail,
  account: LedgerAccount & { book: NonNullable<LedgerAccount["book"]> },
  revision: string,
) {
  if (!revisionPattern.test(revision))
    throw new Error("Keep the exact reviewed revision.")
  return {
    bookId: account.book.id,
    accountId: account.id,
    expectedRevision: revision,
    requestId: detail.id,
    expectedVersion: detail.version,
  }
}

/**
 * The exact saved request the merchant opened for approval. The attestation
 * and fingerprint are bound to this snapshot, never rebuilt from a refetch.
 */
export type RefundReviewSnapshot = Pick<
  RefundDetail,
  "id" | "version" | "destinationFingerprint"
>
export function refundReviewSnapshot(
  detail: RefundDetail,
): RefundReviewSnapshot {
  return {
    id: detail.id,
    version: detail.version,
    destinationFingerprint: detail.destinationFingerprint,
  }
}
export function refundReviewIsCurrent(
  reviewed: RefundReviewSnapshot,
  detail: RefundReviewSnapshot,
) {
  return (
    reviewed.id === detail.id &&
    reviewed.version === detail.version &&
    reviewed.destinationFingerprint === detail.destinationFingerprint
  )
}

export function prepareRefundReserve({
  detail,
  account,
  revision,
  reviewed,
  identityChecked,
}: {
  detail: RefundDetail
  account: LedgerAccount
  /** Exact revision: the reviewed detail's, or a retained command's for retry. */
  revision: string
  reviewed: RefundReviewSnapshot
  identityChecked: boolean
}): RefundLifecycleCommand {
  assertScope(detail, account)
  if (detail.status !== "REQUESTED")
    throw new Error("Only a requested refund can be approved and reserved.")
  if (!refundDestination(detail) || !detail.canApprove)
    throw new Error(
      "The saved bank details can't be opened, so this refund can't be approved.",
    )
  if (!refundReviewIsCurrent(reviewed, detail))
    throw new Error(
      "This refund changed since you reviewed it. Go back and review it again.",
    )
  if (!/^[a-f0-9]{64}$/.test(reviewed.destinationFingerprint))
    throw new Error("The saved bank details can't be verified. Refresh first.")
  if (!identityChecked)
    throw new Error("Confirm the customer and destination checks first.")
  return {
    operation: "reserveRefund",
    payload: {
      ...changePayload(detail, account, revision),
      expectedDestinationFingerprint: reviewed.destinationFingerprint,
      identityReviewAttested: true,
    },
  }
}

/** Cancelling never needs the destination; a held refund needs a no-money check. */
export function prepareRefundCancel({
  detail,
  account,
  revision,
  noMoneySent = false,
}: {
  detail: RefundDetail
  account: LedgerAccount
  revision: string
  noMoneySent?: boolean
}): RefundLifecycleCommand {
  assertScope(detail, account)
  if (
    !detail.canCancel ||
    (detail.status !== "REQUESTED" && detail.status !== "RESERVED")
  )
    throw new Error("This refund is already finished.")
  if (detail.status === "RESERVED" && !noMoneySent)
    throw new Error("Confirm no money was sent before releasing the hold.")
  return {
    operation: "cancelRefund",
    payload: changePayload(detail, account, revision),
  }
}

/** Saves a note on a requested refund. Nothing is held and nothing is sent. */
export function prepareRefundDetailsRequest({
  detail,
  account,
  revision,
  note,
}: {
  detail: RefundDetail
  account: LedgerAccount
  revision: string
  note: string
}): RefundLifecycleCommand {
  assertScope(detail, account)
  if (detail.status !== "REQUESTED")
    throw new Error("Only a requested refund can ask for more details.")
  const trimmed = note.trim()
  if (!trimmed || trimmed.length > 400)
    throw new Error("Say which details are needed, in up to 400 characters.")
  return {
    operation: "requestRefundDetails",
    payload: { ...changePayload(detail, account, revision), note: trimmed },
  }
}

export type RefundCompletionFields = {
  moneyAccountId: string
  reference: string
  date: string
  returnChecked: boolean
}

export function prepareRefundCompletion({
  detail,
  account,
  revision,
  fields,
  moneyAccounts,
  now = new Date(),
}: {
  detail: RefundDetail
  account: LedgerAccount
  revision: string
  fields: RefundCompletionFields
  moneyAccounts: LedgerMoneyAccount[] | undefined
  now?: Date
}): RefundLifecycleCommand {
  assertScope(detail, account)
  if (!revisionPattern.test(revision))
    throw new Error("Keep the exact reviewed revision.")
  if (detail.status !== "RESERVED" || !detail.approvedAt)
    throw new Error("Approve and reserve this refund before recording it.")
  if (!refundDestination(detail))
    throw new Error(
      "The saved bank details can't be opened, so this return can't be recorded here.",
    )
  if (!fields.returnChecked)
    throw new Error("Confirm the outgoing transfer in your bank first.")
  if (
    !eligibleLedgerMoneyAccounts(moneyAccounts ?? [], "BANK_TRANSFER").some(
      (a) => a.id === fields.moneyAccountId,
    )
  )
    throw new Error("Choose the bank account the money left from.")
  const outgoingReference = fields.reference.trim()
  if (!outgoingReference || outgoingReference.length > 160)
    throw new Error("Enter the outgoing reference from your bank.")
  const effectiveAt = new Date(fields.date)
  if (
    Number.isNaN(effectiveAt.getTime()) ||
    effectiveAt.toISOString() !== fields.date
  )
    throw new Error("Choose when the money left your bank.")
  if (effectiveAt < new Date(detail.approvedAt))
    throw new Error("The return can't be dated before its approval.")
  if (effectiveAt > now) throw new Error("The return can't be in the future.")
  return {
    operation: "completeRefund",
    payload: {
      bookId: account.book.id,
      accountId: account.id,
      expectedRevision: revision,
      requestId: detail.id,
      expectedVersion: detail.version,
      moneyAccountId: fields.moneyAccountId,
      outgoingReference,
      effectiveAt,
    },
  }
}

/**
 * A reviewed lifecycle command is stale once the saved request moves on, or,
 * for approval, once the saved destination differs from the one attested.
 */
export function refundCommandIsCurrent(
  command: RefundCommand,
  detail: RefundReviewSnapshot,
) {
  if (command.operation === "requestRefund") return true
  return (
    command.payload.requestId === detail.id &&
    command.payload.expectedVersion === detail.version &&
    (command.operation !== "reserveRefund" ||
      command.payload.expectedDestinationFingerprint ===
        detail.destinationFingerprint)
  )
}

/** Exact minor units back to an editable major-unit string (no Number). */
export function minorToInput(minor: string) {
  const value = BigInt(minor)
  const fraction = value % 100n
  return fraction === 0n
    ? (value / 100n).toString()
    : `${value / 100n}.${fraction.toString().padStart(2, "0")}`
}
