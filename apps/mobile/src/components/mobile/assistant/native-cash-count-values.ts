import {
  type GeneralCashCountAction,
  cashCountAction,
} from "@ewatrade/assistant/general/contracts"

export type NativeCashCountValues = {
  amount: string
  date: string
  reference: string
  acknowledged: boolean
}
export type NativeCashCountAccount = {
  id: string
  bookId: string
  purpose: string
  archivedAt: Date | string | null
}

/** Only the reviewed physical observation seeds the field; never a ledger balance. */
export function nativeCashCountValues(
  initial: GeneralCashCountAction,
): NativeCashCountValues {
  const valid = cashCountAction.parse(initial)
  const minor = BigInt(valid.observedBalanceMinor)
  return {
    amount: `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`,
    date: valid.asOf,
    reference: valid.reference,
    acknowledged: false,
  }
}

export function parseNativeObservedCash(value: string) {
  const match = /^(0|[1-9]\d{0,16})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match?.[1])
    throw Error(
      "Enter a non-negative cash amount with at most two decimal places.",
    )
  const minor =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"))
  if (minor > 9223372036854775807n)
    throw Error("Count exceeds the cash-count storage limit.")
  return minor.toString()
}

function countUtc(value: string, original: string) {
  const text = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text))
    throw Error(
      "Enter the count time in explicit UTC, including seconds and Z.",
    )
  const date = new Date(text)
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19) !== text.slice(0, 19)
  )
    throw Error("Enter a valid UTC count date and time.")
  // An unchanged original string preserves every fractional digit, not only ms.
  return text === original ? original : text
}

/** A fresh exact cash-account read is input validation, never confirmation authority. */
export function nativeCashCountCandidate(
  initial: GeneralCashCountAction,
  values: NativeCashCountValues,
  current: { bookId: string; account: NativeCashCountAccount },
):
  | { ok: true; payload: GeneralCashCountAction }
  | { ok: false; error: string } {
  try {
    if (!cashCountAction.safeParse(initial).success)
      throw Error(
        "This saved cash-count draft is invalid. Reopen it from the assistant.",
      )
    if (
      current.bookId !== initial.bookId ||
      current.account.bookId !== initial.bookId ||
      current.account.id !== initial.accountId ||
      current.account.purpose !== "CASH" ||
      current.account.archivedAt !== null
    )
      throw Error(
        "Reload the original active cash account in the reviewed Finance Book.",
      )
    if (values.acknowledged !== true)
      throw Error("Confirm that this cash was physically counted.")
    const reference = values.reference.trim()
    if (!reference) throw Error("Enter a reference for this cash count.")
    if (reference.length > 200)
      throw Error("Keep the count reference within 200 characters.")
    const parsed = cashCountAction.safeParse({
      ...initial,
      observedBalanceMinor: parseNativeObservedCash(values.amount),
      asOf: countUtc(values.date, initial.asOf),
      reference,
      cashPhysicallyCounted: true,
    })
    if (!parsed.success)
      throw Error("Check the cash-count fields or reopen the saved draft.")
    return { ok: true, payload: parsed.data }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Check the cash count.",
    }
  }
}
