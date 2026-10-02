import { financeUtcDate } from "@/lib/finance-expense-input"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"

type SupplierEntryBase = {
  bookId: string
  supplierId: string
  amount: string
  description: string
  date: string
  startsAt: Date | string
  today?: string
}

export type SupplierOpeningPayload = {
  bookId: string
  supplierId: string
  amountMinor: string
  description: string
  effectiveAt: Date
  kind: "PAYABLE" | "ADVANCE"
}

export type SupplierAdvancePayload = {
  bookId: string
  supplierId: string
  amountMinor: string
  description: string
  effectiveAt: Date
  moneyAccountId: string
}

export type SupplierReversalPayload = {
  bookId: string
  entryId: string
  reason: string
  effectiveAt: Date
}

export function prepareSupplierIdentity(input: {
  bookId: string
  code: string
  name: string
}) {
  const code = input.code.trim().toUpperCase()
  const name = input.name.trim()
  if (!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(code))
    throw new Error("Use a supplier code with 1–40 letters, numbers, _ or -.")
  if (!name || name.length > 160)
    throw new Error("Enter a supplier name of up to 160 characters.")
  return { bookId: input.bookId, code, name }
}

export function prepareSupplierEntry(
  input: SupplierEntryBase & {
    kind: "PAYABLE" | "ADVANCE"
    opening: true
  },
): SupplierOpeningPayload
export function prepareSupplierEntry(
  input: SupplierEntryBase & {
    opening?: false
    moneyAccountId: string
    activeMoneyAccountIds: string[]
  },
): SupplierAdvancePayload
export function prepareSupplierEntry(input: {
  bookId: string
  supplierId: string
  amount: string
  description: string
  date: string
  startsAt: Date | string
  today?: string
  kind?: "PAYABLE" | "ADVANCE"
  moneyAccountId?: string
  activeMoneyAccountIds?: string[]
  opening?: boolean
}): SupplierOpeningPayload | SupplierAdvancePayload {
  const description = input.description.trim()
  if (!description || description.length > 400)
    throw new Error("Enter a description of up to 400 characters.")
  const starts = new Date(input.startsAt)
  if (!Number.isFinite(starts.getTime()))
    throw new Error("The bookkeeping start date could not be confirmed.")
  const startDay = starts.toISOString().slice(0, 10)
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  if (input.opening && input.date !== startDay)
    throw new Error(
      `Opening entries must use the book start date, ${startDay} UTC.`,
    )
  if (!input.opening && input.date > today)
    throw new Error("An entry cannot be dated in the future (UTC).")
  const effectiveAt = input.opening
    ? starts
    : financeUtcDate(input.date, starts)
  const common = {
    bookId: input.bookId,
    supplierId: input.supplierId,
    amountMinor: parseFinanceMoney(input.amount),
    description,
    effectiveAt,
  }
  if (input.opening) {
    if (!input.kind) throw new Error("Choose an opening balance type.")
    return { ...common, kind: input.kind }
  }
  if (
    !input.moneyAccountId ||
    !input.activeMoneyAccountIds?.includes(input.moneyAccountId)
  )
    throw new Error(
      "Choose a currently active cash, bank, or clearing account.",
    )
  return { ...common, moneyAccountId: input.moneyAccountId }
}

export function prepareSupplierReversal(input: {
  bookId: string
  entryId: string
  reason: string
  date: string
  originalAt: Date | string
  today?: string
}) {
  const reason = input.reason.trim()
  if (!reason || reason.length > 400)
    throw new Error("Enter a correction reason of up to 400 characters.")
  const originalAt = new Date(input.originalAt)
  if (!Number.isFinite(originalAt.getTime()))
    throw new Error("The original supplier entry date could not be confirmed.")
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  if (input.date > today)
    throw new Error("A correction cannot be dated in the future (UTC).")
  const requestedAt = financeUtcDate(
    input.date,
    originalAt.toISOString().slice(0, 10),
  )
  const effectiveAt = requestedAt < originalAt ? originalAt : requestedAt
  return {
    bookId: input.bookId,
    entryId: input.entryId,
    reason,
    effectiveAt,
  } satisfies SupplierReversalPayload
}
