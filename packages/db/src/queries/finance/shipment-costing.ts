import {
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { FinanceError } from "./rules"

/** Book money is held in hundredths (kobo for NGN). */
const BOOK_MINOR_PER_MAJOR = "100"
const ZERO = BigInt(0)
const ONE = BigInt(1)
const TWO = BigInt(2)
const TEN = BigInt(10)

export type ShipmentRateInput = { currencyCode: string; rate: string }

export type ShipmentCostingLineInput = {
  position: number
  expectedQuantity: string
  sourceCurrencyCode: string
  sourceUnitPrice: string
  freightOverrideMinor?: bigint | null
  adjustmentMinor?: bigint
}

export type ShipmentCostingInput = {
  bookCurrencyCode: string
  rates: ShipmentRateInput[]
  freightAmount: string
  freightCurrencyCode: string
  lines: ShipmentCostingLineInput[]
}

export type ShipmentCostingLine = {
  position: number
  goodsMinor: bigint
  freightMinor: bigint
  adjustmentMinor: bigint
  landedMinor: bigint
}

/** Round a non-negative exact decimal to an integer, half away from zero. */
function roundHalfUp(value: string) {
  const [whole = "0", fraction = ""] = value.split(".")
  const integer = BigInt(whole)
  return (fraction[0] ?? "0") >= "5" ? integer + ONE : integer
}

function rateFor(
  currencyCode: string,
  input: Pick<ShipmentCostingInput, "bookCurrencyCode" | "rates">,
) {
  if (currencyCode === input.bookCurrencyCode) return "1"
  const rate = input.rates.find((r) => r.currencyCode === currencyCode)
  if (!rate)
    throw new FinanceError(
      "INVALID_JOURNAL",
      `Enter the ${input.bookCurrencyCode} rate for 1 ${currencyCode}.`,
    )
  return rate.rate
}

/** Converts a source-currency major amount to book minor units at the pinned rate. */
export function convertToBookMinor(
  amount: string,
  currencyCode: string,
  input: Pick<ShipmentCostingInput, "bookCurrencyCode" | "rates">,
) {
  const major = multiplyExactDecimals(amount, rateFor(currencyCode, input), 60)
  return roundHalfUp(multiplyExactDecimals(major, BOOK_MINOR_PER_MAJOR, 60))
}

/** Rejects missing, duplicate, book-currency or non-positive rates up front. */
export function assertShipmentRates(input: ShipmentCostingInput) {
  const seen = new Set<string>()
  for (const rate of input.rates) {
    if (rate.currencyCode === input.bookCurrencyCode)
      throw new FinanceError(
        "INVALID_JOURNAL",
        `${input.bookCurrencyCode} needs no exchange rate.`,
      )
    if (seen.has(rate.currencyCode))
      throw new FinanceError(
        "INVALID_JOURNAL",
        `Enter one rate for ${rate.currencyCode}.`,
      )
    seen.add(rate.currencyCode)
    parseExactDecimal(rate.rate, { allowZero: false, maxScale: 12 })
  }
  const used = new Set(input.lines.map((l) => l.sourceCurrencyCode))
  if (compareExactDecimals(input.freightAmount, "0") > 0)
    used.add(input.freightCurrencyCode)
  for (const code of used) rateFor(code, input)
  for (const code of seen)
    if (!used.has(code))
      throw new FinanceError(
        "INVALID_JOURNAL",
        `Remove the unused ${code} rate.`,
      )
}

/**
 * Splits freight by converted goods value with the largest-remainder method.
 * Reviewed overrides are taken first; ties go to the earlier line position.
 */
export function allocateShipmentFreight(
  freightMinor: bigint,
  lines: Array<{
    position: number
    goodsMinor: bigint
    freightOverrideMinor?: bigint | null
  }>,
) {
  const result = new Map<number, bigint>()
  let remaining = freightMinor
  const proportional: typeof lines = []
  for (const line of lines) {
    const override = line.freightOverrideMinor
    if (override === null || override === undefined) {
      proportional.push(line)
      continue
    }
    if (override < ZERO)
      throw new FinanceError("INVALID_JOURNAL", "Freight cannot be negative.")
    result.set(line.position, override)
    remaining -= override
  }
  if (remaining < ZERO)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Freight overrides exceed the shipment freight.",
    )
  if (!proportional.length) {
    if (remaining !== ZERO)
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Allocate all shipment freight across the lines.",
      )
    return result
  }
  const value = proportional.reduce((sum, l) => sum + l.goodsMinor, ZERO)
  if (value === ZERO) {
    if (remaining !== ZERO)
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Goods value is zero; enter each line's freight explicitly.",
      )
    for (const line of proportional) result.set(line.position, ZERO)
    return result
  }
  const shares = proportional.map((line) => ({
    position: line.position,
    base: (remaining * line.goodsMinor) / value,
    remainder: (remaining * line.goodsMinor) % value,
  }))
  let leftover = remaining - shares.reduce((sum, s) => sum + s.base, ZERO)
  const order = [...shares].sort((a, b) =>
    a.remainder === b.remainder
      ? a.position - b.position
      : a.remainder > b.remainder
        ? -1
        : 1,
  )
  for (const share of order) {
    const extra = leftover > ZERO ? ONE : ZERO
    leftover -= extra
    result.set(share.position, share.base + extra)
  }
  return result
}

/** Exact goods, freight and landed cost per line; totals reconcile to the minor unit. */
export function computeShipmentCosting(input: ShipmentCostingInput) {
  assertShipmentRates(input)
  const goods = input.lines.map((line) => ({
    ...line,
    goodsMinor: convertToBookMinor(
      multiplyExactDecimals(line.expectedQuantity, line.sourceUnitPrice, 36),
      line.sourceCurrencyCode,
      input,
    ),
  }))
  const freightMinor = convertToBookMinor(
    input.freightAmount,
    input.freightCurrencyCode,
    input,
  )
  const freight = allocateShipmentFreight(freightMinor, goods)
  const lines: ShipmentCostingLine[] = goods.map((line) => {
    const freightShare = freight.get(line.position) ?? ZERO
    const adjustmentMinor = line.adjustmentMinor ?? ZERO
    return {
      position: line.position,
      goodsMinor: line.goodsMinor,
      freightMinor: freightShare,
      adjustmentMinor,
      landedMinor: line.goodsMinor + freightShare + adjustmentMinor,
    }
  })
  return {
    freightMinor,
    lines,
    goodsMinor: lines.reduce((sum, l) => sum + l.goodsMinor, ZERO),
    adjustmentMinor: lines.reduce((sum, l) => sum + l.adjustmentMinor, ZERO),
    landedMinor: lines.reduce((sum, l) => sum + l.landedMinor, ZERO),
  }
}

function scaled(value: string) {
  const [whole = "0", fraction = ""] = value.split(".")
  return { coefficient: BigInt(whole + fraction), scale: fraction.length }
}

/**
 * Cost carried by a receipt of `quantity` from the line's unreceived cost.
 * The final receipt takes the exact remainder so receipts sum to landed cost.
 */
export function shipmentReceiptCostMinor(input: {
  landedMinor: bigint
  receivedCostMinor: bigint
  expectedQuantity: string
  receivedQuantity: string
  quantity: string
}) {
  const remainingCost = input.landedMinor - input.receivedCostMinor
  const expected = scaled(parseExactDecimal(input.expectedQuantity))
  const received = scaled(parseExactDecimal(input.receivedQuantity))
  const quantity = scaled(
    parseExactDecimal(input.quantity, { allowZero: false }),
  )
  const scale = Math.max(expected.scale, received.scale, quantity.scale)
  const at = (v: { coefficient: bigint; scale: number }) =>
    v.coefficient * TEN ** BigInt(scale - v.scale)
  const remainingQuantity = at(expected) - at(received)
  const taken = at(quantity)
  if (taken > remainingQuantity)
    throw new FinanceError(
      "CONFLICT",
      "Received quantity exceeds the outstanding expected quantity.",
    )
  if (taken === remainingQuantity) return remainingCost
  // Round half up so partial receipts never drift systematically low.
  return (
    (remainingCost * taken * TWO + remainingQuantity) /
    (remainingQuantity * TWO)
  )
}

/** Landed unit cost in book minor units, exact to six decimal places (floored). */
export function shipmentLandedUnitMinor(
  landedMinor: bigint,
  quantity: string,
): string {
  const q = scaled(parseExactDecimal(quantity, { allowZero: false }))
  const numerator = landedMinor * TEN ** BigInt(q.scale + 6)
  const units = numerator / q.coefficient
  const text = units.toString().padStart(7, "0")
  return parseExactDecimal(`${text.slice(0, -6)}.${text.slice(-6)}`, {
    allowNegative: true,
  })
}
