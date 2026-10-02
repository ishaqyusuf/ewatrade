import { financeUtcDate } from "@/lib/finance-expense-input"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"

export type AdvanceSource = {
  id: string
  amountMinor: string
  kind: "OPENING_ADVANCE" | "ADVANCE"
  effectiveAt: Date | string
  reversed?: boolean
}

export type AdvanceAllocationHistory = {
  advanceEntryId: string
  amountMinor: string
  effectiveAt: Date | string
  releases: Array<{ amountMinor: string; effectiveAt: Date | string }>
}

export type AdvanceAvailability = AdvanceSource & {
  allocatedMinor: string
  releasedMinor: string
  availableMinor: string
  latestSettlementAt: Date | string | null
}

export type SupplierPurchaseReadSource = {
  id: string
  bookId: string
  supplierId: string
}

export function resolveSupplierPurchaseView<
  T extends SupplierPurchaseReadSource,
>(input: {
  data: T | undefined
  bookId: string
  billId: string
  supplierId: string
  verified: boolean
  success: boolean
  fetching: boolean
  paused: boolean
  offline: boolean
  error: boolean
  settlementOpen: boolean
}) {
  const data = input.data
  const sourceMatches =
    data !== undefined &&
    data.id === input.billId &&
    data.bookId === input.bookId &&
    data.supplierId === input.supplierId
  const usable =
    sourceMatches &&
    input.verified &&
    input.success &&
    !input.paused &&
    !input.offline &&
    !input.error
  return {
    detail: usable && !input.fetching ? data : undefined,
    settlement: usable && input.settlementOpen ? data : undefined,
  }
}

export type SupplierFreshReadState = {
  status: "pending" | "error" | "success"
  fetchStatus: "fetching" | "paused" | "idle"
}

export type SupplierPurchaseHistoryPage<T extends { id: string }> = {
  count: number
  items: T[]
  nextCursor: string | null
}

export function claimSupplierHistoryCursor(
  seenCursors: Set<string>,
  cursor: string,
) {
  if (!cursor || seenCursors.has(cursor))
    throw new Error(
      "Supplier history repeated or returned an invalid page cursor.",
    )
  seenCursors.add(cursor)
}

export function validateSupplierStatementPage<T extends { id: string }>(input: {
  items: T[]
  nextCursor: string | null
  accumulatedRows: number
  maxRows: number
  pageSize: number
  seenIds: Set<string>
}) {
  if (
    !Array.isArray(input.items) ||
    input.items.length > input.pageSize ||
    input.accumulatedRows + input.items.length > input.maxRows ||
    (input.nextCursor !== null &&
      (typeof input.nextCursor !== "string" ||
        !input.nextCursor ||
        input.items.length !== input.pageSize))
  )
    throw new Error("Supplier statement page exceeds the safe source limit.")
  for (const item of input.items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      input.seenIds.has(item.id)
    )
      throw new Error(
        "Supplier statement contains a duplicate or invalid source entry.",
      )
    input.seenIds.add(item.id)
  }
}

export function assertSupplierHistoryRequestAllowed(input: {
  requests: number
  maxRequests: number
  accumulatedRows: number
  maxRows: number
  allowEmptySentinel?: boolean
}) {
  if (
    !Number.isSafeInteger(input.requests) ||
    input.requests < 0 ||
    input.requests >= input.maxRequests ||
    input.accumulatedRows < 0 ||
    input.accumulatedRows > input.maxRows ||
    (input.accumulatedRows === input.maxRows && !input.allowEmptySentinel)
  )
    throw new Error("Supplier history exceeds the safe mobile read limit.")
}

export function supplierPurchasePageReadLimit(input: {
  accumulatedRows: number
  advertisedRows: number
  maxRows: number
  pageSize: number
}) {
  if (
    !Number.isSafeInteger(input.accumulatedRows) ||
    input.accumulatedRows < 0 ||
    input.accumulatedRows > input.maxRows ||
    !Number.isSafeInteger(input.advertisedRows) ||
    input.advertisedRows < 0 ||
    input.advertisedRows > input.maxRows
  )
    throw new Error(
      "Supplier purchase history exceeds the safe mobile read limit.",
    )
  const remainingRows = input.maxRows - input.accumulatedRows
  const emptySentinel =
    remainingRows === 0 || input.advertisedRows === input.maxRows
  return {
    limit: emptySentinel ? 1 : Math.min(input.pageSize, remainingRows),
    emptySentinel,
  }
}

export function validateEmptySupplierPurchaseSentinel<T extends { id: string }>(
  page: SupplierPurchaseHistoryPage<T>,
) {
  if (
    !Number.isSafeInteger(page.count) ||
    page.count !== 0 ||
    !Array.isArray(page.items) ||
    page.items.length !== 0 ||
    page.nextCursor !== null
  )
    throw new Error(
      "Supplier purchase history exceeds the safe mobile read limit.",
    )
}

export function validateSupplierPurchaseHistoryPage<
  T extends { id: string },
>(input: {
  page: SupplierPurchaseHistoryPage<T>
  expectedCount?: number
  accumulatedRows: number
  totalRows?: number
  maxRows: number
  pageSize: number
  seenIds: Set<string>
}) {
  const { page } = input
  if (
    !Number.isSafeInteger(page.count) ||
    page.count < 0 ||
    page.count > input.maxRows ||
    (input.expectedCount !== undefined && page.count !== input.expectedCount)
  )
    throw new Error(
      "Supplier purchase history returned a malformed or changing bill count.",
    )
  if (
    !Array.isArray(page.items) ||
    page.items.length > input.pageSize ||
    input.accumulatedRows + page.items.length > page.count ||
    (input.totalRows ?? input.accumulatedRows) + page.items.length >
      input.maxRows
  )
    throw new Error(
      "Supplier purchase history returned an oversized or contradictory page.",
    )
  for (const item of page.items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      input.seenIds.has(item.id)
    )
      throw new Error(
        "Supplier purchase history contains a duplicate or invalid bill source.",
      )
    input.seenIds.add(item.id)
  }
  if (
    page.nextCursor !== null &&
    (typeof page.nextCursor !== "string" || !page.nextCursor)
  )
    throw new Error(
      "Supplier purchase history returned an invalid page cursor.",
    )
  const nextRows = input.accumulatedRows + page.items.length
  if (
    (page.nextCursor && (page.items.length === 0 || nextRows >= page.count)) ||
    (!page.nextCursor && nextRows !== page.count)
  )
    throw new Error(
      "Supplier purchase history pages contradict their advertised count.",
    )
  return page.nextCursor
}

export async function runSupplierFreshRead<T>(input: {
  isCurrent: () => boolean
  cancelPrior: () => Promise<unknown>
  getState: () => SupplierFreshReadState | undefined
  fetch: () => Promise<T>
}) {
  const assertCurrent = () => {
    if (!input.isCurrent())
      throw new Error(
        "The account or network changed. Repeat the finance read.",
      )
  }
  assertCurrent()
  await input.cancelPrior()
  assertCurrent()
  const beforeFetch = input.getState()
  if (beforeFetch && beforeFetch.fetchStatus !== "idle")
    throw new Error("A previous finance read is still active. Try again.")
  assertCurrent()
  const result = await input.fetch()
  assertCurrent()
  const afterFetch = input.getState()
  if (
    !afterFetch ||
    afterFetch.status !== "success" ||
    afterFetch.fetchStatus !== "idle"
  )
    throw new Error(
      "A fresh finance read is not available. Reconnect and try again.",
    )
  return result
}

function minor(value: string, label: string) {
  if (!/^(0|[1-9]\d{0,14})$/.test(value))
    throw new Error(`The ${label} source contains an invalid minor amount.`)
  return BigInt(value)
}

export function calculateAdvanceAvailability(
  sources: AdvanceSource[],
  history: AdvanceAllocationHistory[],
): AdvanceAvailability[] {
  const known = new Map<
    string,
    {
      source: AdvanceSource
      allocated: bigint
      released: bigint
      latest: Date | null
    }
  >()
  for (const source of sources) {
    if (!source.id || known.has(source.id))
      throw new Error("Supplier statement contains a duplicate advance source.")
    known.set(source.id, {
      source,
      allocated: 0n,
      released: 0n,
      latest: null,
    })
  }
  for (const allocation of history) {
    const current = known.get(allocation.advanceEntryId)
    if (!current)
      throw new Error(
        "Purchase history references an unavailable supplier advance.",
      )
    const allocated = minor(allocation.amountMinor, "allocation")
    let released = 0n
    let latest = new Date(allocation.effectiveAt)
    if (!Number.isFinite(latest.getTime()))
      throw new Error("Purchase history contains an invalid allocation date.")
    for (const release of allocation.releases) {
      const amount = minor(release.amountMinor, "allocation release")
      released += amount
      const releasedAt = new Date(release.effectiveAt)
      if (!Number.isFinite(releasedAt.getTime()))
        throw new Error("Purchase history contains an invalid release date.")
      if (releasedAt > latest) latest = releasedAt
    }
    if (released > allocated)
      throw new Error(
        "Purchase history releases more than the source allocation.",
      )
    current.allocated += allocated
    current.released += released
    if (!current.latest || latest > current.latest) current.latest = latest
  }
  return sources.map((source) => {
    const current = known.get(source.id)
    if (!current)
      throw new Error("Supplier advance history could not be matched.")
    const sourceAmount = minor(source.amountMinor, "advance")
    const netConsumed = current.allocated - current.released
    if (source.reversed && netConsumed !== 0n)
      throw new Error(
        "A reversed supplier advance still has an unreleased allocation.",
      )
    const available = source.reversed
      ? 0n
      : sourceAmount - current.allocated + current.released
    if (available < 0n)
      throw new Error(
        "Purchase history consumes more than the supplier advance.",
      )
    return {
      ...source,
      allocatedMinor: current.allocated.toString(),
      releasedMinor: current.released.toString(),
      availableMinor: available.toString(),
      latestSettlementAt: current.latest,
    }
  })
}

function utcDay(value: Date | string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()))
    throw new Error("Choose a valid settlement date.")
  return date.toISOString().slice(0, 10)
}

export function settlementDateAtOrAfter(
  day: string,
  minimum: Date | string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (day > today)
    throw new Error("A settlement cannot be dated in the future (UTC).")
  const date = financeUtcDate(day, utcDay(minimum))
  const boundary = new Date(minimum)
  return date < boundary ? boundary : date
}

export function preparePurchasePayment(input: {
  bookId: string
  billId: string
  amount: string
  outstandingMinor: string
  moneyAccountId: string
  description: string
  reference: string
  date: string
  minimumAt: Date | string
  today?: string
}) {
  const amountMinor = parseFinanceMoney(input.amount)
  if (
    minor(amountMinor, "payment") <= 0n ||
    minor(amountMinor, "payment") >
      minor(input.outstandingMinor, "bill payable")
  )
    throw new Error("Payment exceeds the current purchase payable.")
  if (!input.moneyAccountId)
    throw new Error("Choose an active cash, bank, or clearing account.")
  const description = input.description.trim()
  const reference = input.reference.trim()
  if (!description || description.length > 400)
    throw new Error("Enter a payment description of up to 400 characters.")
  if (reference.length > 160)
    throw new Error("Use a payment reference of up to 160 characters.")
  return {
    bookId: input.bookId,
    billId: input.billId,
    amountMinor,
    moneyAccountId: input.moneyAccountId,
    description,
    ...(reference ? { reference } : {}),
    effectiveAt: settlementDateAtOrAfter(
      input.date,
      input.minimumAt,
      input.today,
    ),
  }
}

export function preparePurchasePaymentReversal(input: {
  bookId: string
  paymentId: string
  reason: string
  date: string
  paymentAt: Date | string
  latestBillEntryAt: Date | string
  today?: string
}) {
  const reason = input.reason.trim()
  if (!reason || reason.length > 400)
    throw new Error("Enter a reversal reason of up to 400 characters.")
  const minimum =
    new Date(input.paymentAt) > new Date(input.latestBillEntryAt)
      ? input.paymentAt
      : input.latestBillEntryAt
  return {
    bookId: input.bookId,
    paymentId: input.paymentId,
    reason,
    effectiveAt: settlementDateAtOrAfter(input.date, minimum, input.today),
  }
}

export function prepareSupplierAdvanceAllocation(input: {
  bookId: string
  billId: string
  advanceEntryId: string
  amount: string
  availableMinor: string
  outstandingMinor: string
  description: string
  date: string
  latestBillEntryAt: Date | string
  advanceEffectiveAt: Date | string
  latestAdvanceSettlementAt: Date | string | null
  today?: string
}) {
  const amountMinor = parseFinanceMoney(input.amount)
  if (
    minor(amountMinor, "allocation") <= 0n ||
    minor(amountMinor, "allocation") >
      minor(input.availableMinor, "available advance") ||
    minor(amountMinor, "allocation") >
      minor(input.outstandingMinor, "bill payable")
  )
    throw new Error(
      "Allocation exceeds the current available advance or purchase payable.",
    )
  const description = input.description.trim()
  if (!description || description.length > 400)
    throw new Error("Enter an allocation description of up to 400 characters.")
  const boundaries = [input.latestBillEntryAt, input.advanceEffectiveAt]
  if (input.latestAdvanceSettlementAt)
    boundaries.push(input.latestAdvanceSettlementAt)
  const minimum = boundaries.reduce((latest, value) =>
    new Date(value) > new Date(latest) ? value : latest,
  )
  return {
    bookId: input.bookId,
    billId: input.billId,
    advanceEntryId: input.advanceEntryId,
    amountMinor,
    description,
    effectiveAt: settlementDateAtOrAfter(input.date, minimum, input.today),
  }
}

export function prepareSupplierAllocationRelease(input: {
  bookId: string
  allocationId: string
  amount: string
  unreleasedMinor: string
  reason: string
  date: string
  allocationAt: Date | string
  latestBillEntryAt: Date | string
  latestAdvanceSettlementAt: Date | string | null
  today?: string
}) {
  const amountMinor = parseFinanceMoney(input.amount)
  if (
    minor(amountMinor, "release") <= 0n ||
    minor(amountMinor, "release") >
      minor(input.unreleasedMinor, "unreleased allocation")
  )
    throw new Error(
      "Release exceeds the allocation amount still applied to this purchase.",
    )
  const reason = input.reason.trim()
  if (!reason || reason.length > 400)
    throw new Error(
      "Enter an allocation release reason of up to 400 characters.",
    )
  const boundaries = [input.allocationAt, input.latestBillEntryAt]
  if (input.latestAdvanceSettlementAt)
    boundaries.push(input.latestAdvanceSettlementAt)
  const minimum = boundaries.reduce((latest, value) =>
    new Date(value) > new Date(latest) ? value : latest,
  )
  return {
    bookId: input.bookId,
    allocationId: input.allocationId,
    amountMinor,
    reason,
    effectiveAt: settlementDateAtOrAfter(input.date, minimum, input.today),
  }
}
