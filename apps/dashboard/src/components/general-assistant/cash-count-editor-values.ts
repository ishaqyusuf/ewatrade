import {
  type GeneralCashCountAction,
  cashCountAction,
} from "@ewatrade/assistant/general/contracts"
import { preserveReviewedTimestamp } from "./posting-date"

export function parseObservedCash(value: string) {
  const match = /^(0|[1-9]\d{0,16})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match?.[1])
    throw new Error(
      "Enter a non-negative cash amount with up to two decimal places.",
    )
  const minor = (
    BigInt(match[1]) * 100n +
    BigInt((match[2] ?? "").padEnd(2, "0"))
  ).toString()
  if (BigInt(minor) > 9223372036854775807n)
    throw new Error("Count exceeds the cash-count storage limit.")
  return minor
}
export function cashCountEditorPayload(
  initial: GeneralCashCountAction,
  values: {
    amount: string
    date: string
    reference: string
    acknowledged: boolean
  },
) {
  if (!values.acknowledged)
    throw new Error("Confirm that this cash was physically counted.")
  const date = new Date(`${values.date}Z`)
  if (!Number.isFinite(date.getTime()))
    throw new Error("Choose a valid count date and time.")
  return cashCountAction.parse({
    ...initial,
    observedBalanceMinor: parseObservedCash(values.amount),
    asOf: preserveReviewedTimestamp(date, initial.asOf),
    reference: values.reference,
    cashPhysicallyCounted: true,
  })
}
