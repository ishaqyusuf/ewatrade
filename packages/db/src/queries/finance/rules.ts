import { createHash } from "node:crypto"

export class FinanceError extends Error {
  constructor(
    public readonly code:
      | "INVALID_AMOUNT"
      | "INVALID_JOURNAL"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "CLOSED_PERIOD",
    message: string,
  ) {
    super(message)
    this.name = "FinanceError"
  }
}

// A single line fits PostgreSQL BIGINT with headroom for aggregation.
export const MAX_FINANCE_AMOUNT = BigInt(100_000_000_000_000)

export function financeAmount(value: string): bigint {
  if (!/^[1-9]\d{0,14}$/.test(value)) {
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Enter a positive whole minor-unit amount.",
    )
  }
  const amount = BigInt(value)
  if (amount > MAX_FINANCE_AMOUNT) {
    throw new FinanceError(
      "INVALID_AMOUNT",
      "The amount exceeds the transaction limit.",
    )
  }
  return amount
}

export type FinanceLineInput = {
  accountId: string
  side: "DEBIT" | "CREDIT"
  amountMinor: string
  description?: string
}

export function validateFinanceLines(lines: FinanceLineInput[]) {
  if (lines.length < 2 || lines.length > 100) {
    throw new FinanceError("INVALID_JOURNAL", "A journal requires 2–100 lines.")
  }
  let debits = BigInt(0)
  let credits = BigInt(0)
  const normalized = lines.map((line) => {
    if (!line.accountId.trim() || !["DEBIT", "CREDIT"].includes(line.side)) {
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Every line requires an account and side.",
      )
    }
    const amount = financeAmount(line.amountMinor)
    if (line.side === "DEBIT") debits += amount
    else credits += amount
    return {
      accountId: line.accountId,
      debitMinor: line.side === "DEBIT" ? amount : BigInt(0),
      creditMinor: line.side === "CREDIT" ? amount : BigInt(0),
      description: line.description?.trim() || null,
    }
  })
  if (debits !== credits) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Journal debits and credits must balance.",
    )
  }
  return normalized
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "bigint") return value.toString()
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    )
  }
  return value
}

export function financePayloadHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
}

export function assertFinancePostingDate(input: {
  effectiveAt: Date
  startsAt: Date
  closedThrough: Date | null
  now: Date
}) {
  const date = input.effectiveAt.getTime()
  if (
    !Number.isFinite(date) ||
    date < input.startsAt.getTime() ||
    date > input.now.getTime()
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Posting date must be within the book's active history.",
    )
  }
  if (input.closedThrough && date <= input.closedThrough.getTime()) {
    throw new FinanceError("CLOSED_PERIOD", "This accounting period is closed.")
  }
}
