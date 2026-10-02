import type { SupplierAgingSource } from "./supplier-aging-rules"

const start = new Date("2026-01-01T00:00:00.000Z")
const date = (day: string) => new Date(`${day}T12:00:00.000Z`)
export function agingSource(input: {
  id: string
  sequence: number
  kind?: string
  amount?: bigint
  effectiveAt?: Date
  dueAt?: Date | null
  billId?: string | null
  reversal?: SupplierAgingSource
}): SupplierAgingSource {
  const kind = input.kind ?? "PURCHASE_BILL"
  const amount = input.amount ?? BigInt(1000)
  const effectiveAt =
    input.effectiveAt ??
    (kind.startsWith("OPENING_") ? start : date("2026-01-02"))
  const billId =
    input.billId === undefined
      ? kind === "PURCHASE_BILL"
        ? input.id
        : null
      : input.billId
  const payable =
    kind === "PURCHASE_BILL" || kind === "OPENING_PAYABLE"
      ? amount
      : kind === "PURCHASE_PAYMENT" || kind === "ADVANCE_ALLOCATION"
        ? -amount
        : kind === "ALLOCATION_RELEASE"
          ? amount
          : BigInt(0)
  const advance = ["ADVANCE", "OPENING_ADVANCE", "ALLOCATION_RELEASE"].includes(
    kind,
  )
    ? amount
    : kind === "ADVANCE_ALLOCATION"
      ? -amount
      : BigInt(0)
  const line = (
    accountId: string,
    purpose: string,
    delta: bigint,
    debitNormal: boolean,
  ) => ({
    bookId: "book",
    accountId,
    debitMinor:
      delta > BigInt(0) === debitNormal
        ? delta < BigInt(0)
          ? -delta
          : delta
        : BigInt(0),
    creditMinor:
      delta > BigInt(0) !== debitNormal
        ? delta < BigInt(0)
          ? -delta
          : delta
        : BigInt(0),
    account: {
      bookId: "book",
      purpose,
      kind:
        purpose === "PAYABLE"
          ? "LIABILITY"
          : purpose === "OPENING_EQUITY"
            ? "EQUITY"
            : "ASSET",
    },
  })
  let lines = [
    ...(payable ? [line("payable", "PAYABLE", payable, false)] : []),
    ...(advance ? [line("advance", "SUPPLIER_ADVANCE", advance, true)] : []),
  ]
  if (lines.length === 1) {
    const control = lines[0]
    if (!control) throw new Error("Missing control")
    const other = line(
      "other",
      kind.startsWith("OPENING_") ? "OPENING_EQUITY" : "CASH",
      amount,
      true,
    )
    other.debitMinor = control.creditMinor
    other.creditMinor = control.debitMinor
    lines.push(other)
  }
  const original = input.reversal
  if (original)
    lines = original.journalEntry.lines.map((row) => ({
      ...row,
      debitMinor: row.creditMinor,
      creditMinor: row.debitMinor,
    }))
  const sourceKind = original
    ? original.kind === "PURCHASE_BILL"
      ? "PURCHASE_RECOGNITION_REVERSAL"
      : original.kind === "PURCHASE_PAYMENT"
        ? "PURCHASE_PAYMENT_REVERSAL"
        : "SUPPLIER_ENTRY_REVERSAL"
    : kind === "ADVANCE_ALLOCATION"
      ? "SUPPLIER_ADVANCE_ALLOCATION"
      : kind === "ALLOCATION_RELEASE"
        ? "SUPPLIER_ALLOCATION_RELEASE"
        : kind.startsWith("OPENING_") || kind === "ADVANCE"
          ? `SUPPLIER_${kind}`
          : kind
  const paymentId = kind === "PURCHASE_PAYMENT" ? `payment-${input.id}` : null
  const moneyAccountId =
    original?.moneyAccountId ??
    (kind === "ADVANCE" || kind === "PURCHASE_PAYMENT" ? "other" : null)
  return {
    id: input.id,
    bookId: "book",
    supplierId: "supplier",
    kind,
    side: original
      ? original.side === "DEBIT"
        ? "CREDIT"
        : "DEBIT"
      : payable > BigInt(0)
        ? "CREDIT"
        : "DEBIT",
    amountMinor: amount,
    effectiveAt,
    actorUserId: "owner",
    description: "Source",
    billId: original?.billId ?? billId,
    paymentId,
    moneyAccountId,
    reversalOfId: original?.id ?? null,
    bill: billId
      ? {
          id: billId,
          bookId: "book",
          supplierId: "supplier",
          kind: "PURCHASE",
          totalMinor: BigInt(1000),
          incurredAt: date("2026-01-02"),
          dueAt: input.dueAt ?? null,
          storeId: "store",
          actorUserId: "owner",
          description: "Source",
          reference: null,
        }
      : null,
    payment:
      paymentId && billId
        ? {
            id: paymentId,
            bookId: "book",
            billId,
            accountId: "other",
            amountMinor: amount,
            effectiveAt,
            actorUserId: "owner",
          }
        : null,
    settledAllocation: null,
    releasedAllocation: null,
    journalEntry: {
      id: `journal-${input.id}`,
      bookId: "book",
      sequence: BigInt(input.sequence),
      sourceKind,
      sourceId: original
        ? original.kind === "PURCHASE_BILL"
          ? "recognition-reversal"
          : original.id
        : kind.startsWith("OPENING_")
          ? "supplier"
          : (paymentId ?? input.id),
      effectiveAt,
      actorUserId: "owner",
      storeId: original?.journalEntry.storeId ?? (billId ? "store" : null),
      reversalOfId: original?.journalEntry.id ?? null,
      lines,
    },
  }
}
