export const EXACT_QUANTITY_MAX_SCALE = 6
export const EXACT_FACTOR_MAX_SCALE = 12
export const EXACT_CANONICAL_MAX_SCALE = 18

declare const exactDecimalBrand: unique symbol

export type ExactDecimalString = string & {
  readonly [exactDecimalBrand]: true
}

export type ParseExactDecimalOptions = {
  allowNegative?: boolean
  allowZero?: boolean
  maxScale?: number
}

export type ExactDecimalErrorCode =
  | "INEXACT_DIVISION"
  | "INVALID_DECIMAL"
  | "NEGATIVE_NOT_ALLOWED"
  | "SCALE_EXCEEDED"
  | "ZERO_NOT_ALLOWED"

export class ExactDecimalError extends Error {
  readonly code: ExactDecimalErrorCode

  constructor(code: ExactDecimalErrorCode, message: string) {
    super(message)
    this.name = "ExactDecimalError"
    this.code = code
  }
}

type ExactDecimalParts = {
  coefficient: bigint
  scale: number
}

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/
const BIGINT_ZERO = BigInt(0)
const BIGINT_TEN = BigInt(10)

function assertScale(maxScale: number) {
  if (!Number.isInteger(maxScale) || maxScale < 0) {
    throw new RangeError("maxScale must be a non-negative integer.")
  }
}

function normalizeParts(parts: ExactDecimalParts): ExactDecimalParts {
  let { coefficient, scale } = parts

  if (coefficient === BIGINT_ZERO) {
    return { coefficient: BIGINT_ZERO, scale: 0 }
  }

  while (scale > 0 && coefficient % BIGINT_TEN === BIGINT_ZERO) {
    coefficient /= BIGINT_TEN
    scale -= 1
  }

  return { coefficient, scale }
}

function partsToString(parts: ExactDecimalParts): ExactDecimalString {
  const normalized = normalizeParts(parts)
  const negative = normalized.coefficient < BIGINT_ZERO
  const digits = (negative ? -normalized.coefficient : normalized.coefficient)
    .toString()
    .padStart(normalized.scale + 1, "0")

  if (normalized.scale === 0) {
    return `${negative ? "-" : ""}${digits}` as ExactDecimalString
  }

  const whole = digits.slice(0, -normalized.scale)
  const fraction = digits.slice(-normalized.scale)

  return `${negative ? "-" : ""}${whole}.${fraction}` as ExactDecimalString
}

function exactDecimalParts(value: string): ExactDecimalParts {
  const negative = value.startsWith("-")
  const unsigned = negative ? value.slice(1) : value
  const [whole, fraction = ""] = unsigned.split(".")
  const coefficient = BigInt(`${whole}${fraction}`)

  return normalizeParts({
    coefficient: negative ? -coefficient : coefficient,
    scale: fraction.length,
  })
}

function withScale(parts: ExactDecimalParts, scale: number): bigint {
  return parts.coefficient * BIGINT_TEN ** BigInt(scale - parts.scale)
}

function assertOutputScale(parts: ExactDecimalParts, maxScale: number) {
  const normalized = normalizeParts(parts)

  if (normalized.scale > maxScale) {
    throw new ExactDecimalError(
      "SCALE_EXCEEDED",
      `Decimal result exceeds the maximum scale of ${maxScale}.`,
    )
  }

  return normalized
}

export function parseExactDecimal(
  input: string,
  options: ParseExactDecimalOptions = {},
): ExactDecimalString {
  const value = input.trim()
  const maxScale = options.maxScale ?? EXACT_CANONICAL_MAX_SCALE
  assertScale(maxScale)

  if (!DECIMAL_PATTERN.test(value)) {
    throw new ExactDecimalError(
      "INVALID_DECIMAL",
      "Use a plain decimal string without exponent notation.",
    )
  }

  const parts = exactDecimalParts(value)

  if (!options.allowNegative && parts.coefficient < BIGINT_ZERO) {
    throw new ExactDecimalError(
      "NEGATIVE_NOT_ALLOWED",
      "A negative decimal is not allowed here.",
    )
  }

  if (options.allowZero === false && parts.coefficient === BIGINT_ZERO) {
    throw new ExactDecimalError(
      "ZERO_NOT_ALLOWED",
      "A value greater than zero is required.",
    )
  }

  return partsToString(assertOutputScale(parts, maxScale))
}

export function isExactDecimal(
  input: string,
  options: ParseExactDecimalOptions = {},
): input is ExactDecimalString {
  try {
    parseExactDecimal(input, options)
    return true
  } catch {
    return false
  }
}

export function compareExactDecimals(left: string, right: string) {
  const leftParts = exactDecimalParts(
    parseExactDecimal(left, { allowNegative: true }),
  )
  const rightParts = exactDecimalParts(
    parseExactDecimal(right, { allowNegative: true }),
  )
  const scale = Math.max(leftParts.scale, rightParts.scale)
  const leftCoefficient = withScale(leftParts, scale)
  const rightCoefficient = withScale(rightParts, scale)

  if (leftCoefficient < rightCoefficient) return -1
  if (leftCoefficient > rightCoefficient) return 1
  return 0
}

export function addExactDecimals(
  left: string,
  right: string,
  maxScale = EXACT_CANONICAL_MAX_SCALE,
): ExactDecimalString {
  assertScale(maxScale)
  const leftParts = exactDecimalParts(
    parseExactDecimal(left, { allowNegative: true }),
  )
  const rightParts = exactDecimalParts(
    parseExactDecimal(right, { allowNegative: true }),
  )
  const scale = Math.max(leftParts.scale, rightParts.scale)

  return partsToString(
    assertOutputScale(
      {
        coefficient: withScale(leftParts, scale) + withScale(rightParts, scale),
        scale,
      },
      maxScale,
    ),
  )
}

export function subtractExactDecimals(
  left: string,
  right: string,
  maxScale = EXACT_CANONICAL_MAX_SCALE,
): ExactDecimalString {
  const parsedRight = exactDecimalParts(
    parseExactDecimal(right, { allowNegative: true }),
  )

  return addExactDecimals(
    left,
    partsToString({
      coefficient: -parsedRight.coefficient,
      scale: parsedRight.scale,
    }),
    maxScale,
  )
}

export function multiplyExactDecimals(
  left: string,
  right: string,
  maxScale = EXACT_CANONICAL_MAX_SCALE,
): ExactDecimalString {
  assertScale(maxScale)
  const leftParts = exactDecimalParts(
    parseExactDecimal(left, { allowNegative: true }),
  )
  const rightParts = exactDecimalParts(
    parseExactDecimal(right, { allowNegative: true }),
  )

  return partsToString(
    assertOutputScale(
      {
        coefficient: leftParts.coefficient * rightParts.coefficient,
        scale: leftParts.scale + rightParts.scale,
      },
      maxScale,
    ),
  )
}

function quotientParts(left: string, right: string, outputScale: number) {
  assertScale(outputScale)
  const leftParts = exactDecimalParts(
    parseExactDecimal(left, { allowNegative: true }),
  )
  const rightParts = exactDecimalParts(
    parseExactDecimal(right, { allowNegative: true, allowZero: false }),
  )
  const numerator =
    leftParts.coefficient * BIGINT_TEN ** BigInt(rightParts.scale + outputScale)
  const denominator =
    rightParts.coefficient * BIGINT_TEN ** BigInt(leftParts.scale)

  return {
    quotient: numerator / denominator,
    remainder: numerator % denominator,
  }
}

export function divideExactDecimals(
  left: string,
  right: string,
  outputScale = EXACT_CANONICAL_MAX_SCALE,
): ExactDecimalString {
  const { quotient, remainder } = quotientParts(left, right, outputScale)

  if (remainder !== BIGINT_ZERO) {
    throw new ExactDecimalError(
      "INEXACT_DIVISION",
      `Decimal quotient cannot be represented exactly at scale ${outputScale}.`,
    )
  }

  return partsToString({ coefficient: quotient, scale: outputScale })
}

export function floorExactDecimalQuotient(
  left: string,
  right: string,
  outputScale: number,
): ExactDecimalString {
  const { quotient } = quotientParts(left, right, outputScale)
  return partsToString({ coefficient: quotient, scale: outputScale })
}
