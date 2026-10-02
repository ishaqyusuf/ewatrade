import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { financeUtcDate } from "./finance-expense-input"

export const financeMoneyKinds = {
  TRANSFER: "Transfer between accounts",
  OWNER_CONTRIBUTION: "Owner funding",
  OWNER_WITHDRAWAL: "Owner drawings",
  OPENING_BALANCE: "Opening balance",
} as const
export type FinanceMoneyKind = keyof typeof financeMoneyKinds

export function prepareMoneyMovement(input: {
  bookId: string
  startsAt: Date | string
  kind: FinanceMoneyKind
  accountId: string
  destinationAccountId: string
  activeAccountIds: string[]
  amount: string
  description: string
  date: string
}) {
  if (!input.activeAccountIds.includes(input.accountId))
    throw new Error("Choose an active business money account.")
  if (
    input.kind === "TRANSFER" &&
    (input.accountId === input.destinationAccountId ||
      !input.activeAccountIds.includes(input.destinationAccountId))
  )
    throw new Error("Choose a different active destination account.")
  const description = input.description.trim()
  if (!description || description.length > 500)
    throw new Error("Enter a description of up to 500 characters.")
  const common = {
    bookId: input.bookId,
    accountId: input.accountId,
    amountMinor: parseFinanceMoney(input.amount),
    description,
    effectiveAt:
      input.kind === "OPENING_BALANCE"
        ? new Date(input.startsAt)
        : financeUtcDate(input.date, input.startsAt),
  }
  return input.kind === "TRANSFER"
    ? {
        ...common,
        kind: input.kind,
        destinationAccountId: input.destinationAccountId,
      }
    : { ...common, kind: input.kind }
}

export function prepareMoneyCorrection(input: {
  bookId: string
  entryId: string
  sourceKind: string
  effectiveAt: Date | string
  reversed: boolean
  reason: string
  date: string
  now?: Date
}) {
  if (
    input.reversed ||
    !["TRANSFER", "OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL"].includes(
      input.sourceKind,
    )
  )
    throw new Error("This original money movement cannot be reversed.")
  const reason = input.reason.trim()
  if (!reason || reason.length > 400)
    throw new Error("Enter a correction reason of up to 400 characters.")
  const original = new Date(input.effectiveAt)
  const day = original.toISOString().slice(0, 10)
  const requested = financeUtcDate(input.date, `${day}T00:00:00.000Z`)
  if (input.date > (input.now ?? new Date()).toISOString().slice(0, 10))
    throw new Error("A correction cannot be dated in the future.")
  return {
    bookId: input.bookId,
    entryId: input.entryId,
    reason,
    effectiveAt: requested < original ? original : requested,
  }
}

export function prepareFinanceStatementRange(
  from: string,
  through: string,
  startsAt: Date | string,
) {
  const start = new Date(startsAt)
  const first = financeUtcDate(
    from,
    `${start.toISOString().slice(0, 10)}T00:00:00.000Z`,
  )
  const last = financeUtcDate(through, first)
  last.setUTCHours(23, 59, 59, 999)
  return { from: first < start ? start : first, through: last }
}
