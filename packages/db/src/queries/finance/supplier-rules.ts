import { FinanceError, MAX_FINANCE_AMOUNT } from "./rules"

export function normalizeFinanceSupplier(input: {
  code: string
  name: string
}) {
  const code = input.code.trim().toUpperCase()
  const name = input.name.trim()
  if (
    !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(code) ||
    name.length < 1 ||
    name.length > 160
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Enter a valid supplier code and name.",
    )
  }
  return { code, name }
}

export function normalizeFinanceSupplierDescription(value: string) {
  const description = value.trim()
  if (!description || description.length > 400) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Enter a description of 1–400 characters.",
    )
  }
  return description
}

type SupplierJournalLine = {
  accountId: string
  debitMinor: bigint
  creditMinor: bigint
}

export function assertOriginalSupplierPosting(input: {
  kind: "OPENING_PAYABLE" | "OPENING_ADVANCE" | "ADVANCE" | "REVERSAL"
  side: "DEBIT" | "CREDIT"
  amountMinor: bigint
  moneyAccountId: string | null
  entryId: string
  supplierId: string
  supplierActorUserId: string
  supplierEffectiveAt: Date
  supplierDescription: string
  bookStartsAt: Date
  journal: {
    sourceKind: string
    sourceId: string
    reversalOfId: string | null
    actorUserId: string
    effectiveAt: Date
    description: string
    lines: SupplierJournalLine[]
  }
  advanceAccountId: string
  payableAccountId: string
  openingEquityAccountId: string
}) {
  const { journal } = input
  if (
    input.kind === "REVERSAL" ||
    input.side !== (input.kind === "OPENING_PAYABLE" ? "CREDIT" : "DEBIT") ||
    journal.sourceKind !==
      (input.kind === "OPENING_PAYABLE"
        ? "SUPPLIER_OPENING_PAYABLE"
        : input.kind === "OPENING_ADVANCE"
          ? "SUPPLIER_OPENING_ADVANCE"
          : "SUPPLIER_ADVANCE") ||
    journal.sourceId !==
      (input.kind === "ADVANCE" ? input.entryId : input.supplierId) ||
    journal.reversalOfId !== null ||
    journal.actorUserId !== input.supplierActorUserId ||
    journal.effectiveAt.getTime() !== input.supplierEffectiveAt.getTime() ||
    journal.description !== input.supplierDescription ||
    (input.kind !== "ADVANCE" &&
      (input.moneyAccountId !== null ||
        input.supplierEffectiveAt.getTime() !==
          input.bookStartsAt.getTime())) ||
    (input.kind === "ADVANCE" && input.moneyAccountId === null) ||
    journal.lines.length !== 2
  ) {
    throw new FinanceError(
      "CONFLICT",
      "The supplier entry does not match its original posting.",
    )
  }

  const expected: Array<readonly [string | null, "DEBIT" | "CREDIT"]> =
    input.kind === "OPENING_PAYABLE"
      ? [
          [input.openingEquityAccountId, "DEBIT" as const],
          [input.payableAccountId, "CREDIT" as const],
        ]
      : input.kind === "OPENING_ADVANCE"
        ? [
            [input.advanceAccountId, "DEBIT" as const],
            [input.openingEquityAccountId, "CREDIT" as const],
          ]
        : [
            [input.advanceAccountId, "DEBIT" as const],
            [input.moneyAccountId, "CREDIT" as const],
          ]
  const matchesExpectedLine = (
    accountId: string | null,
    side: "DEBIT" | "CREDIT",
  ) =>
    accountId !== null &&
    journal.lines.some((line) => {
      const amount = side === "DEBIT" ? line.debitMinor : line.creditMinor
      const oppositeAmount =
        side === "DEBIT" ? line.creditMinor : line.debitMinor
      return (
        line.accountId === accountId &&
        amount === input.amountMinor &&
        oppositeAmount === BigInt(0) &&
        amount > BigInt(0)
      )
    })
  if (
    input.amountMinor <= BigInt(0) ||
    input.amountMinor > MAX_FINANCE_AMOUNT ||
    expected.some(
      ([accountId, side]) => !matchesExpectedLine(accountId, side),
    ) ||
    journal.lines.some(
      (line) => line.debitMinor < BigInt(0) || line.creditMinor < BigInt(0),
    )
  ) {
    throw new FinanceError(
      "CONFLICT",
      "The supplier journal lines do not match the recorded operation.",
    )
  }
}
