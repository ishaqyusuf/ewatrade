const QUANTITY_SCALE = BigInt("1000000000000000000")
const MAX_QUANTITY_UNITS = BigInt("99999999999999999999999999999999999999")
const MAX_MINOR_UNITS = BigInt("9223372036854775807")

/** Parse a non-negative decimal quantity into Decimal(38,18) fixed units. */
function parseQuantity(value: string): bigint {
  if (typeof value !== "string" || value.length > 39) {
    throw new RangeError("Quantity must fit Decimal(38,18).")
  }

  const match = /^(0|[1-9]\d{0,19})(?:\.(\d{1,18}))?$/.exec(value)
  if (!match) {
    throw new TypeError(
      "Quantity must be a non-negative decimal with at most 18 fractional places.",
    )
  }

  const integerPart = match[1]
  if (integerPart === undefined) {
    throw new TypeError("Quantity requires an integer part.")
  }
  const fractionalPart = match[2] ?? ""
  const units =
    BigInt(integerPart) * QUANTITY_SCALE +
    BigInt(fractionalPart.padEnd(18, "0") || "0")

  if (units > MAX_QUANTITY_UNITS) {
    throw new RangeError("Quantity must fit Decimal(38,18).")
  }

  return units
}

function formatQuantity(units: bigint): string {
  const integerPart = (units / QUANTITY_SCALE).toString()
  const fractionalPart = (units % QUANTITY_SCALE)
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "")

  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart
}

/** Normalize a non-negative decimal quantity without passing through Number. */
export function normalizeQuantity(value: string): string {
  return formatQuantity(parseQuantity(value))
}

/** Add quantities exactly, rejecting a result outside Decimal(38,18). */
export function addQuantities(left: string, right: string): string {
  const result = parseQuantity(left) + parseQuantity(right)
  if (result > MAX_QUANTITY_UNITS) {
    throw new RangeError("Quantity sum must fit Decimal(38,18).")
  }
  return formatQuantity(result)
}

/** Subtract quantities exactly, rejecting a negative result. */
export function subtractQuantities(left: string, right: string): string {
  const minuend = parseQuantity(left)
  const subtrahend = parseQuantity(right)
  if (subtrahend > minuend) {
    throw new RangeError("Quantity difference cannot be negative.")
  }
  return formatQuantity(minuend - subtrahend)
}

function roundHalfToEven(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const doubledRemainder = remainder * BigInt(2)

  if (
    doubledRemainder > denominator ||
    (doubledRemainder === denominator && quotient % BigInt(2) !== BigInt(0))
  ) {
    return quotient + BigInt(1)
  }
  return quotient
}

export type WeightedAverageIssueInput = {
  quantityBefore: string
  valueBeforeMinor: bigint
  quantityIssued: string
}

export type WeightedAverageIssue = {
  quantityAfter: string
  valueIssuedMinor: bigint
  valueAfterMinor: bigint
}

/**
 * Allocate carrying value proportionally for an issue from one weighted-average
 * pool. Partial allocations use integer round-half-to-even; full depletion takes
 * the entire residual so a sequence of issues always conserves pool value.
 */
export function calculateWeightedAverageIssue({
  quantityBefore,
  valueBeforeMinor,
  quantityIssued,
}: WeightedAverageIssueInput): WeightedAverageIssue {
  const beforeUnits = parseQuantity(quantityBefore)
  const issuedUnits = parseQuantity(quantityIssued)

  if (beforeUnits === BigInt(0)) {
    throw new RangeError("The valuation pool quantity must be positive.")
  }
  if (issuedUnits === BigInt(0)) {
    throw new RangeError("Issued quantity must be positive.")
  }
  if (issuedUnits > beforeUnits) {
    throw new RangeError("Issued quantity cannot exceed the pool quantity.")
  }
  if (
    typeof valueBeforeMinor !== "bigint" ||
    valueBeforeMinor < BigInt(0) ||
    valueBeforeMinor > MAX_MINOR_UNITS
  ) {
    throw new RangeError("Pool value must be a non-negative database BigInt.")
  }

  const depleted = issuedUnits === beforeUnits
  const valueIssuedMinor = depleted
    ? valueBeforeMinor
    : roundHalfToEven(valueBeforeMinor * issuedUnits, beforeUnits)

  return {
    quantityAfter: formatQuantity(beforeUnits - issuedUnits),
    valueIssuedMinor,
    valueAfterMinor: valueBeforeMinor - valueIssuedMinor,
  }
}
