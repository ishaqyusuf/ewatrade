import { FinanceError } from "./rules"

export function financeBankSignedBalance(value: string) {
  if (!/^(0|-?[1-9]\d{0,18})$/.test(value))
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Enter a signed whole minor-unit bank balance.",
    )
  const amount = BigInt(value)
  if (amount < -9223372036854775808n || amount > 9223372036854775807n)
    throw new FinanceError(
      "INVALID_AMOUNT",
      "The bank balance exceeds its storage limit.",
    )
  return amount
}

export function financeBankRevision(value: string) {
  if (
    !/^(0|[1-9]\d{0,18})$/.test(value) ||
    BigInt(value) >= 9223372036854775807n
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Retain the current bank evidence revision.",
    )
  return BigInt(value)
}

export function financeBankReason(value: string) {
  const reason = value.trim()
  if (!reason || reason.length > 400)
    throw new FinanceError("INVALID_JOURNAL", "A review reason is required.")
  return reason
}

export function financeBankSelectedIds(value: readonly string[]) {
  if (
    !value.length ||
    value.length > 50 ||
    value.some((id) => !id || id !== id.trim() || id.length > 128) ||
    new Set(value).size !== value.length
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Select 1–50 unique original rows on each side of the match.",
    )
  return [...value].sort()
}
