import { FinanceError, MAX_FINANCE_AMOUNT } from "./rules"

const DAY_MS = 86_400_000
const MAX_SEQUENCE = BigInt("9223372036854775807")
export const MAX_SUPPLIER_AGING_SOURCES = 1_000

export const SUPPLIER_AGING_BUCKETS = [
  "NOT_DUE",
  "DUE_TODAY",
  "OVERDUE_1_30",
  "OVERDUE_31_60",
  "OVERDUE_61_90",
  "OVERDUE_91_PLUS",
  "UNDATED",
] as const
export type SupplierAgingBucket = (typeof SUPPLIER_AGING_BUCKETS)[number]

export function supplierAgingDate(value: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FinanceError("INVALID_JOURNAL", "Choose an exact UTC as-of date.")
  }
  const startsAt = new Date(`${value}T00:00:00.000Z`)
  if (
    !Number.isFinite(startsAt.getTime()) ||
    startsAt.toISOString().slice(0, 10) !== value ||
    value < "0001-01-01" ||
    value > "9999-12-30"
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Choose a valid UTC as-of date.")
  }
  return { startsAt, endsBefore: new Date(startsAt.getTime() + DAY_MS) }
}

export function supplierAgingSequence(value: string | undefined) {
  if (value === undefined) return undefined
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d{0,18})$/.test(value) ||
    BigInt(value) > MAX_SEQUENCE
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid payable aging sequence.")
  }
  return BigInt(value)
}

export function supplierAgingBucket(dueAt: Date | null, asOfDate: string) {
  const { startsAt } = supplierAgingDate(asOfDate)
  if (dueAt === null) return { bucket: "UNDATED" as const, daysOverdue: null }
  if (!Number.isFinite(dueAt.getTime())) conflict()
  const dueDay = new Date(dueAt)
  dueDay.setUTCHours(0, 0, 0, 0)
  // UTC days are integral, so DST and local timezone cannot shift a bucket.
  const days = (startsAt.getTime() - dueDay.getTime()) / DAY_MS
  const bucket: SupplierAgingBucket =
    days < 0
      ? "NOT_DUE"
      : days === 0
        ? "DUE_TODAY"
        : days <= 30
          ? "OVERDUE_1_30"
          : days <= 60
            ? "OVERDUE_31_60"
            : days <= 90
              ? "OVERDUE_61_90"
              : "OVERDUE_91_PLUS"
  return { bucket, daysOverdue: Math.max(0, days) }
}

type AgingBill = {
  id: string
  bookId: string
  supplierId: string | null
  kind: string
  totalMinor: bigint
  incurredAt: Date
  dueAt: Date | null
  storeId: string | null
  actorUserId: string
  description: string
  reference: string | null
}
type AgingLine = {
  bookId: string
  accountId: string
  debitMinor: bigint
  creditMinor: bigint
  account: { bookId: string; purpose: string; kind: string }
}
export type SupplierAgingSource = {
  id: string
  bookId: string
  supplierId: string
  kind: string
  side: string
  amountMinor: bigint
  effectiveAt: Date
  actorUserId: string
  description: string
  billId: string | null
  paymentId: string | null
  moneyAccountId: string | null
  reversalOfId: string | null
  bill: AgingBill | null
  payment: {
    id: string
    bookId: string
    billId: string
    accountId: string
    amountMinor: bigint
    effectiveAt: Date
    actorUserId: string
  } | null
  settledAllocation: {
    id: string
    bookId: string
    supplierId: string
    billId: string
    advanceEntryId: string
    amountMinor: bigint
    effectiveAt: Date
    actorUserId: string
  } | null
  releasedAllocation: {
    id: string
    bookId: string
    supplierId: string
    amountMinor: bigint
    effectiveAt: Date
    actorUserId: string
    allocation: { id: string; billId: string; supplierEntryId: string }
  } | null
  journalEntry: {
    id: string
    bookId: string
    sequence: bigint
    sourceKind: string
    sourceId: string
    effectiveAt: Date
    actorUserId: string
    storeId: string | null
    reversalOfId: string | null
    lines: AgingLine[]
  }
}

function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Payable aging sources require reconciliation.",
  )
}
function sameDate(a: Date, b: Date) {
  return Number.isFinite(a.getTime()) && a.getTime() === b.getTime()
}
function controlDelta(source: SupplierAgingSource) {
  let payable = BigInt(0)
  let advance = BigInt(0)
  let debit = BigInt(0)
  let credit = BigInt(0)
  const { lines } = source.journalEntry
  if (lines.length < 2 || lines.length > 100) conflict()
  for (const line of lines) {
    if (
      line.bookId !== source.bookId ||
      line.account.bookId !== source.bookId ||
      line.debitMinor < BigInt(0) ||
      line.creditMinor < BigInt(0) ||
      line.debitMinor > BigInt(0) === line.creditMinor > BigInt(0) ||
      line.debitMinor > MAX_FINANCE_AMOUNT ||
      line.creditMinor > MAX_FINANCE_AMOUNT
    )
      conflict()
    debit += line.debitMinor
    credit += line.creditMinor
    if (line.account.purpose === "PAYABLE") {
      if (line.account.kind !== "LIABILITY") conflict()
      payable += line.creditMinor - line.debitMinor
    }
    if (line.account.purpose === "SUPPLIER_ADVANCE") {
      if (line.account.kind !== "ASSET") conflict()
      advance += line.debitMinor - line.creditMinor
    }
  }
  if (debit !== credit || debit !== source.amountMinor) conflict()
  return { payable, advance }
}

export function calculateSupplierPayableAging(input: {
  bookId: string
  supplierId: string
  bookStartsAt: Date
  snapshotSequence: bigint
  asOfDate: string
  sources: SupplierAgingSource[]
  payableControlMinor: bigint
  advanceControlMinor: bigint
}) {
  const { endsBefore } = supplierAgingDate(input.asOfDate)
  if (input.sources.length > MAX_SUPPLIER_AGING_SOURCES) {
    throw new FinanceError(
      "CONFLICT",
      `Payable aging exceeds the ${MAX_SUPPLIER_AGING_SOURCES}-source limit; a staged report is required.`,
    )
  }
  const sources = [...input.sources].sort((a, b) =>
    a.journalEntry.sequence < b.journalEntry.sequence
      ? -1
      : a.journalEntry.sequence > b.journalEntry.sequence
        ? 1
        : 0,
  )
  const byId = new Map<string, SupplierAgingSource>()
  const deltas = new Map<string, ReturnType<typeof controlDelta>>()
  const principals = new Map<
    string,
    { source: SupplierAgingSource; outstandingMinor: bigint }
  >()
  const reversed = new Set<string>()
  const released = new Map<string, bigint>()
  const advanceResiduals = new Map<string, bigint>()
  let lastSequence = BigInt(0)
  let advanceMinor = BigInt(0)
  for (const source of sources) {
    const journal = source.journalEntry
    if (
      byId.has(source.id) ||
      source.bookId !== input.bookId ||
      source.supplierId !== input.supplierId ||
      journal.bookId !== input.bookId ||
      journal.sequence <= lastSequence ||
      journal.sequence > input.snapshotSequence ||
      !sameDate(source.effectiveAt, journal.effectiveAt) ||
      source.effectiveAt >= endsBefore ||
      source.effectiveAt < input.bookStartsAt ||
      source.actorUserId !== journal.actorUserId ||
      source.amountMinor <= BigInt(0) ||
      source.amountMinor > MAX_FINANCE_AMOUNT
    )
      conflict()
    lastSequence = journal.sequence
    const delta = controlDelta(source)
    const amount = source.amountMinor
    let expectedPayable = BigInt(0)
    let expectedAdvance = BigInt(0)
    let principalId: string | null = null
    if (source.kind === "REVERSAL") {
      const original = source.reversalOfId
        ? byId.get(source.reversalOfId)
        : undefined
      const originalDelta = source.reversalOfId
        ? deltas.get(source.reversalOfId)
        : undefined
      if (
        !original ||
        !originalDelta ||
        original.kind === "REVERSAL" ||
        ![
          "OPENING_PAYABLE",
          "OPENING_ADVANCE",
          "ADVANCE",
          "PURCHASE_BILL",
          "PURCHASE_PAYMENT",
        ].includes(original.kind) ||
        reversed.has(original.id) ||
        journal.reversalOfId !== original.journalEntry.id ||
        amount !== original.amountMinor ||
        source.billId !== original.billId ||
        source.moneyAccountId !== original.moneyAccountId ||
        source.paymentId !== null ||
        source.effectiveAt < original.effectiveAt ||
        source.side !== (original.side === "DEBIT" ? "CREDIT" : "DEBIT") ||
        journal.storeId !== original.journalEntry.storeId
      )
        conflict()
      const reversalKinds =
        original.kind === "PURCHASE_BILL"
          ? ["PURCHASE_RECOGNITION_REVERSAL"]
          : original.kind === "PURCHASE_PAYMENT"
            ? ["PURCHASE_PAYMENT_REVERSAL"]
            : ["SUPPLIER_ENTRY_REVERSAL"]
      if (
        !reversalKinds.includes(journal.sourceKind) ||
        (original.kind !== "PURCHASE_BILL" && journal.sourceId !== original.id)
      )
        conflict()
      const inverse = (lines: AgingLine[], swap: boolean) =>
        lines
          .map(
            (line) =>
              `${line.accountId}:${swap ? line.creditMinor : line.debitMinor}:${swap ? line.debitMinor : line.creditMinor}`,
          )
          .sort()
          .join("|")
      if (
        inverse(journal.lines, false) !==
        inverse(original.journalEntry.lines, true)
      )
        conflict()
      expectedPayable = -originalDelta.payable
      expectedAdvance = -originalDelta.advance
      if (originalDelta.advance > BigInt(0)) {
        if (advanceResiduals.get(original.id) !== original.amountMinor)
          conflict()
        advanceResiduals.set(original.id, BigInt(0))
      }
      principalId =
        original.kind === "OPENING_PAYABLE" ? original.id : original.billId
      reversed.add(original.id)
    } else {
      if (source.reversalOfId !== null || journal.reversalOfId !== null)
        conflict()
      const creditSide = [
        "OPENING_PAYABLE",
        "PURCHASE_BILL",
        "ALLOCATION_RELEASE",
      ].includes(source.kind)
      if (source.side !== (creditSide ? "CREDIT" : "DEBIT")) conflict()
      if (
        ["OPENING_PAYABLE", "OPENING_ADVANCE", "ADVANCE"].includes(source.kind)
      ) {
        const sourceKind = `SUPPLIER_${source.kind}`
        if (
          journal.sourceKind !== sourceKind ||
          journal.sourceId !==
            (source.kind === "ADVANCE" ? source.id : input.supplierId) ||
          source.billId !== null ||
          source.paymentId !== null ||
          source.bill !== null ||
          (source.kind !== "ADVANCE" &&
            (!sameDate(source.effectiveAt, input.bookStartsAt) ||
              source.moneyAccountId !== null))
        )
          conflict()
        const counterpart = journal.lines.find((line) =>
          source.kind === "ADVANCE"
            ? line.accountId === source.moneyAccountId &&
              line.account.kind === "ASSET" &&
              ["CASH", "BANK", "CLEARING"].includes(line.account.purpose)
            : line.account.kind === "EQUITY" &&
              line.account.purpose === "OPENING_EQUITY",
        )
        if (
          journal.lines.length !== 2 ||
          !counterpart ||
          (source.kind === "OPENING_PAYABLE"
            ? counterpart.debitMinor !== amount
            : counterpart.creditMinor !== amount)
        )
          conflict()
        if (source.kind === "OPENING_PAYABLE") {
          expectedPayable = amount
          principalId = source.id
          principals.set(source.id, { source, outstandingMinor: BigInt(0) })
        } else {
          expectedAdvance = amount
          advanceResiduals.set(source.id, amount)
        }
      } else {
        const bill = source.bill
        if (
          !bill ||
          bill.id !== source.billId ||
          bill.bookId !== input.bookId ||
          bill.supplierId !== input.supplierId ||
          bill.kind !== "PURCHASE" ||
          bill.storeId !== journal.storeId ||
          (bill.dueAt !== null &&
            (!Number.isFinite(bill.dueAt.getTime()) ||
              bill.dueAt < bill.incurredAt))
        )
          conflict()
        principalId = bill.id
        if (source.kind === "PURCHASE_BILL") {
          if (
            principals.has(bill.id) ||
            journal.sourceKind !== "PURCHASE_BILL" ||
            journal.sourceId !== bill.id ||
            bill.totalMinor !== amount ||
            !sameDate(bill.incurredAt, source.effectiveAt) ||
            bill.actorUserId !== source.actorUserId ||
            bill.description !== source.description ||
            source.paymentId !== null ||
            source.moneyAccountId !== null
          )
            conflict()
          expectedPayable = amount
          principals.set(bill.id, { source, outstandingMinor: BigInt(0) })
        } else {
          const principal = principals.get(bill.id)
          if (
            !principal ||
            reversed.has(principal.source.id) ||
            source.effectiveAt < principal.source.effectiveAt
          )
            conflict()
          if (source.kind === "PURCHASE_PAYMENT") {
            const payment = source.payment
            if (
              !payment ||
              payment.id !== source.paymentId ||
              payment.billId !== bill.id ||
              payment.bookId !== input.bookId ||
              payment.accountId !== source.moneyAccountId ||
              payment.amountMinor !== amount ||
              !sameDate(payment.effectiveAt, source.effectiveAt) ||
              payment.actorUserId !== source.actorUserId ||
              journal.sourceKind !== "PURCHASE_PAYMENT" ||
              journal.sourceId !== payment.id
            )
              conflict()
            if (
              journal.lines.length !== 2 ||
              !journal.lines.some(
                (line) =>
                  line.accountId === source.moneyAccountId &&
                  line.creditMinor === amount &&
                  line.account.kind === "ASSET" &&
                  ["CASH", "BANK", "CLEARING"].includes(line.account.purpose),
              )
            )
              conflict()
            expectedPayable = -amount
          } else if (source.kind === "ADVANCE_ALLOCATION") {
            const allocation = source.settledAllocation
            const advance = allocation
              ? byId.get(allocation.advanceEntryId)
              : undefined
            if (
              !allocation ||
              !advance ||
              !["ADVANCE", "OPENING_ADVANCE"].includes(advance.kind) ||
              reversed.has(advance.id) ||
              allocation.bookId !== input.bookId ||
              allocation.supplierId !== input.supplierId ||
              allocation.billId !== bill.id ||
              allocation.amountMinor !== amount ||
              !sameDate(allocation.effectiveAt, source.effectiveAt) ||
              allocation.actorUserId !== source.actorUserId ||
              source.effectiveAt < advance.effectiveAt ||
              journal.sourceKind !== "SUPPLIER_ADVANCE_ALLOCATION" ||
              journal.sourceId !== allocation.id
            )
              conflict()
            expectedPayable = -amount
            expectedAdvance = -amount
            const residual =
              (advanceResiduals.get(advance.id) ?? BigInt(0)) - amount
            if (residual < BigInt(0)) conflict()
            advanceResiduals.set(advance.id, residual)
          } else if (source.kind === "ALLOCATION_RELEASE") {
            const release = source.releasedAllocation
            const allocationSource = release
              ? byId.get(release.allocation.supplierEntryId)
              : undefined
            if (
              !release ||
              !allocationSource ||
              allocationSource.kind !== "ADVANCE_ALLOCATION" ||
              release.allocation.id !==
                allocationSource.settledAllocation?.id ||
              release.allocation.billId !== bill.id ||
              release.bookId !== input.bookId ||
              release.supplierId !== input.supplierId ||
              release.amountMinor !== amount ||
              release.actorUserId !== source.actorUserId ||
              !sameDate(release.effectiveAt, source.effectiveAt) ||
              source.effectiveAt < allocationSource.effectiveAt ||
              journal.sourceKind !== "SUPPLIER_ALLOCATION_RELEASE" ||
              journal.sourceId !== release.id
            )
              conflict()
            const totalReleased =
              (released.get(allocationSource.id) ?? BigInt(0)) + amount
            if (totalReleased > allocationSource.amountMinor) conflict()
            released.set(allocationSource.id, totalReleased)
            expectedPayable = amount
            expectedAdvance = amount
            const advanceId = allocationSource.settledAllocation?.advanceEntryId
            const originalAdvance = advanceId ? byId.get(advanceId) : undefined
            if (!advanceId || !originalAdvance || reversed.has(advanceId))
              conflict()
            const residual =
              (advanceResiduals.get(advanceId) ?? BigInt(0)) + amount
            if (residual > originalAdvance.amountMinor) conflict()
            advanceResiduals.set(advanceId, residual)
          } else conflict()
        }
      }
    }
    if (delta.payable !== expectedPayable || delta.advance !== expectedAdvance)
      conflict()
    if (expectedPayable !== BigInt(0)) {
      const principal = principalId ? principals.get(principalId) : undefined
      if (!principal) conflict()
      principal.outstandingMinor += expectedPayable
      if (
        principal.outstandingMinor < BigInt(0) ||
        principal.outstandingMinor > principal.source.amountMinor
      )
        conflict()
    }
    advanceMinor += expectedAdvance
    if (advanceMinor < BigInt(0)) conflict()
    byId.set(source.id, source)
    deltas.set(source.id, delta)
  }
  const buckets = SUPPLIER_AGING_BUCKETS.map((bucket) => ({
    bucket,
    amountMinor: BigInt(0),
    sourceCount: 0,
  }))
  const data = [...principals.values()]
    .filter((item) => item.outstandingMinor > BigInt(0))
    .map(({ source, outstandingMinor }) => {
      const dueAt = source.bill?.dueAt ?? null
      const aging = supplierAgingBucket(dueAt, input.asOfDate)
      const bucket = buckets.find((item) => item.bucket === aging.bucket)
      if (!bucket) conflict()
      bucket.amountMinor += outstandingMinor
      bucket.sourceCount++
      return {
        sourceEntryId: source.id,
        sequence: source.journalEntry.sequence.toString(),
        billId: source.billId,
        kind: source.kind,
        storeId: source.bill?.storeId ?? null,
        reference: source.bill?.reference ?? null,
        description: source.description,
        incurredAt: source.effectiveAt,
        dueAt,
        ...aging,
        originalMinor: source.amountMinor.toString(),
        outstandingMinor: outstandingMinor.toString(),
      }
    })
  const payableMinor = buckets.reduce(
    (sum, bucket) => sum + bucket.amountMinor,
    BigInt(0),
  )
  if (
    payableMinor !== input.payableControlMinor ||
    advanceMinor !== input.advanceControlMinor
  )
    conflict()
  return {
    payableMinor: payableMinor.toString(),
    advanceMinor: advanceMinor.toString(),
    buckets: buckets.map((bucket) => ({
      ...bucket,
      amountMinor: bucket.amountMinor.toString(),
    })),
    data,
  }
}
