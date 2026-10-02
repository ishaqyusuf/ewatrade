import type {
  LedgerAccount,
  LedgerDetail,
  LedgerMoneyAccount,
  LedgerRequest,
  LedgerSource,
} from "@/components/mobile/customer-ledger/types"
import type { CustomerLedgerMode } from "@/components/mobile/customer-ledger/types"
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
  if (!account.book) throw new Error("A matching currency book is required.")
  const base = { bookId: account.book.id, accountId: account.id }
  const reason = fields.reason.trim()
  const expectedRevision = fields.revision
  const needsRevision = ["apply", "release", "refund", "reverse"].includes(mode)
  if (needsRevision && !/^(0|[1-9]\d{0,18})$/.test(expectedRevision))
    throw new Error("Keep the exact reviewed revision.")
  if (!["apply"].includes(mode) && !reason)
    throw new Error("Enter a description or reason.")
  const effectiveAt = new Date(fields.date)
  if (
    ["refund", "reverse"].includes(mode) &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(fields.date) ||
      Number.isNaN(effectiveAt.getTime()) ||
      effectiveAt.toISOString() !== fields.date)
  )
    throw new Error(
      "Enter a valid ISO UTC time (for example 2026-10-02T10:00:00.000Z).",
    )
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
      throw new Error("This entry does not support a standalone correction.")
    if (
      detail.entry.kind !== "REFUND" &&
      BigInt(detail.usedAmountMinor) !== BigInt(0)
    )
      throw new Error(
        "Release active allocations before correcting this entry.",
      )
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
      throw new Error(
        "Choose an active money account that matches the payment method.",
      )
  }
  if (mode === "receipt")
    return {
      operation: "recordReceipt",
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
        "Choose available credit and an amount within its remaining balance.",
      )
  }
  if (mode === "apply") {
    const charge = charges.find((s) => s.id === fields.chargeEntryId)
    if (!charge || BigInt(amountMinor) > BigInt(charge.remainingAmountMinor))
      throw new Error(
        "Choose an outstanding charge and an amount within its remaining balance.",
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
    throw new Error(
      "Choose an active allocation and an amount within its unreleased balance.",
    )
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
