import type {
  LedgerAccount,
  LedgerDetail,
  LedgerMoneyAccount,
  LedgerRequest,
  LedgerSource,
} from "@/components/customer-ledger/types"
import type { CustomerLedgerMode } from "@/hooks/use-customer-ledger-params"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { z } from "zod"
export const ledgerFieldsSchema = z.object({
  amount: z.string(),
  reason: z.string().max(400),
  reference: z.string().max(160),
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"]),
  direction: z.enum(["DEBT", "CREDIT"]),
  moneyAccountId: z.string(),
  creditEntryId: z.string(),
  chargeEntryId: z.string(),
  revision: z.string(),
  date: z.string(),
  /** Receipt only: use the payment on their unpaid Orders right away. */
  applyNow: z.boolean(),
})
export type LedgerFields = z.infer<typeof ledgerFieldsSchema>
export function eligibleLedgerMoneyAccounts(
  accounts: LedgerMoneyAccount[],
  method: LedgerFields["method"],
) {
  return accounts.filter(
    (a) =>
      a.archivedAt === null &&
      a.kind === "ASSET" &&
      ["CASH", "BANK", "CLEARING"].includes(a.purpose) &&
      (method === "CASH"
        ? a.purpose === "CASH"
        : method === "BANK_TRANSFER"
          ? a.purpose === "BANK"
          : ["CARD", "POS"].includes(method)
            ? a.purpose !== "CASH"
            : true),
  )
}
export function prepareCustomerLedgerCommand({
  mode,
  account,
  fields,
  credits = [],
  charges = [],
  moneyAccounts = [],
  detail,
  allocationId,
}: {
  mode: Exclude<CustomerLedgerMode, "entry">
  account: LedgerAccount
  fields: LedgerFields
  credits?: LedgerSource[]
  charges?: LedgerSource[]
  moneyAccounts?: LedgerMoneyAccount[]
  detail?: LedgerDetail
  allocationId?: string
}): LedgerRequest {
  fields = ledgerFieldsSchema.parse(fields)
  if (!account.book)
    throw new Error(
      "Set up Finance in this currency before recording payments.",
    )
  const base = { bookId: account.book.id, accountId: account.id }
  const reason = fields.reason.trim()
  const expectedRevision = fields.revision
  const needsRevision = ["apply", "release", "refund", "reverse"].includes(mode)
  if (needsRevision && !/^(0|[1-9]\d{0,18})$/.test(expectedRevision))
    throw new Error("Enter the same check number as the earlier attempt.")
  if (!["apply"].includes(mode) && !reason)
    throw new Error("Add a short note or reason.")
  const effectiveAt = new Date(fields.date)
  if (
    ["refund", "reverse"].includes(mode) &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(fields.date) ||
      Number.isNaN(effectiveAt.getTime()) ||
      effectiveAt.toISOString() !== fields.date)
  )
    throw new Error("Choose a valid date and time.")
  if (mode === "reverse") {
    if (
      !detail ||
      detail.reversal ||
      detail.entry.reversalOfId ||
      !["OPENING_DEBT", "OPENING_CREDIT", "RECEIPT", "REFUND"].includes(
        detail.entry.kind,
      ) ||
      detail.reconciliationRequired
    )
      throw new Error("This entry can’t be undone on its own.")
    if (
      detail.entry.kind !== "REFUND" &&
      BigInt(detail.usedAmountMinor) !== BigInt(0)
    )
      throw new Error("Take this payment off its Orders first, then undo it.")
    return {
      operation: "reverseEntry",
      payload: {
        ...base,
        entryId: detail.entry.id,
        expectedRevision,
        reason,
        effectiveAt,
      },
    }
  }
  const amountMinor = parseFinanceMoney(fields.amount)
  if (mode === "opening")
    return {
      operation: "recordOpening",
      payload: { ...base, direction: fields.direction, amountMinor, reason },
    }
  if (mode === "receipt" || mode === "refund") {
    if (
      !eligibleLedgerMoneyAccounts(moneyAccounts, fields.method).some(
        (a) => a.id === fields.moneyAccountId,
      )
    )
      throw new Error("Choose an account that takes this payment method.")
  }
  if (mode === "receipt")
    return {
      operation:
        fields.applyNow && BigInt(account.totals.outstandingDebtMinor) > 0
          ? "recordReceiptAndApply"
          : "recordReceipt",
      payload: {
        ...base,
        moneyAccountId: fields.moneyAccountId,
        amountMinor,
        method: fields.method,
        reference: fields.reference.trim() || undefined,
        description: reason,
      },
    }
  const credit = credits.find((s) => s.id === fields.creditEntryId)
  if (mode === "apply" || mode === "refund") {
    if (!credit || BigInt(amountMinor) > BigInt(credit.remainingAmountMinor))
      throw new Error(
        "Choose money paid ahead, and an amount up to what’s left of it.",
      )
  }
  if (mode === "apply") {
    const charge = charges.find((s) => s.id === fields.chargeEntryId)
    if (!charge || BigInt(amountMinor) > BigInt(charge.remainingAmountMinor))
      throw new Error(
        "Choose an unpaid Order, and an amount up to what’s left to pay on it.",
      )
    return {
      operation: "applyCredit",
      payload: {
        ...base,
        expectedRevision,
        creditEntryId: fields.creditEntryId,
        chargeEntryId: fields.chargeEntryId,
        amountMinor,
      },
    }
  }
  if (mode === "refund")
    return {
      operation: "refundUnusedCredit",
      payload: {
        ...base,
        expectedRevision,
        creditEntryId: fields.creditEntryId,
        amountMinor,
        moneyAccountId: fields.moneyAccountId,
        method: fields.method,
        reference: fields.reference.trim() || undefined,
        reason,
        effectiveAt,
      },
    }
  const allocation = detail?.allocations.find((a) => a.id === allocationId)
  if (
    !allocation ||
    detail?.reconciliationRequired ||
    BigInt(amountMinor) > BigInt(allocation.remainingAmountMinor)
  )
    throw new Error("Choose an amount up to what’s still used on this Order.")
  return {
    operation: "releaseAllocation",
    payload: {
      ...base,
      expectedRevision,
      allocationId: allocation.id,
      amountMinor,
      reason,
    },
  }
}

/** Advisory preview only; repositories compute and validate the committed controls. */
export function customerLedgerReviewTotals(
  account: LedgerAccount,
  request: LedgerRequest,
) {
  if (request.operation === "reverseEntry") return null
  const amount = BigInt(request.payload.amountMinor)
  let debt = BigInt(account.totals.outstandingDebtMinor)
  let credit = BigInt(account.totals.availableCreditMinor)
  switch (request.operation) {
    case "recordOpening":
      if (request.payload.direction === "DEBT") debt += amount
      else credit += amount
      break
    case "recordReceipt":
      credit += amount
      break
    case "recordReceiptAndApply": {
      // Oldest unpaid charges first; what's left stays paid ahead.
      const used = amount < debt ? amount : debt
      debt -= used
      credit += amount - used
      break
    }
    case "applyCredit":
      debt -= amount
      credit -= amount
      break
    case "releaseAllocation":
      debt += amount
      credit += amount
      break
    case "refundUnusedCredit":
      credit -= amount
      break
  }
  return {
    outstandingDebtMinor: debt.toString(),
    availableCreditMinor: credit.toString(),
    netBalanceMinor: (debt - credit).toString(),
  }
}
