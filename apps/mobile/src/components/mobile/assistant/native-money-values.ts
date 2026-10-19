import {
  type GeneralAction,
  generalActionSchema,
  normalizedSaleName,
} from "@ewatrade/assistant/general/contracts"
import {
  statedAmountPattern,
  statedAmountToMinor,
} from "@ewatrade/assistant/general/stated-money"

export const nativeMoneyActions = [
  "money_in_record",
  "expense_record_simple",
  "money_transfer_simple",
] as const
export type NativeMoneyAction = Extract<
  GeneralAction,
  { action: (typeof nativeMoneyActions)[number] }
>
export function isNativeMoneyAction(
  action: GeneralAction,
): action is NativeMoneyAction {
  return (nativeMoneyActions as readonly string[]).includes(action.action)
}

/** Form edits cannot rehome a saved draft, change its posting instant or attach unsent files. */
export function nativeMoneyCandidate(
  initial: NativeMoneyAction,
  draft: NativeMoneyAction,
  amount: string,
): { ok: true; payload: GeneralAction } | { ok: false; error: string } {
  const refuse = (error: string) => ({ ok: false as const, error })
  if (
    draft.action !== initial.action ||
    draft.effectiveAt !== initial.effectiveAt
  )
    return refuse("Ask in chat to change this draft’s operation or date.")
  if (
    initial.action !== "money_in_record" &&
    draft.action !== "money_in_record" &&
    draft.bookId !== initial.bookId
  )
    return refuse("Review the original Finance Book again.")
  if (
    new Set(draft.attachmentIds).size !== draft.attachmentIds.length ||
    draft.attachmentIds.some((id) => !initial.attachmentIds.includes(id))
  )
    return refuse(
      "Only original photos already sent with this draft can be retained.",
    )
  const value = amount.trim()
  if (value && !statedAmountPattern.test(value))
    return refuse("Enter a valid amount with at most two decimal places.")
  const amountMinor = value ? Number(statedAmountToMinor(value)) : undefined
  let candidate = { ...draft, amountMinor }
  if (candidate.action === "expense_record_simple" && candidate.paid === false)
    candidate = {
      ...candidate,
      accountName: undefined,
      moneyAccountId: undefined,
    }
  if (candidate.action === "money_transfer_simple") {
    if (
      (candidate.fromMoneyAccountId &&
        candidate.fromMoneyAccountId === candidate.toMoneyAccountId) ||
      (candidate.fromAccountName &&
        candidate.toAccountName &&
        normalizedSaleName(candidate.fromAccountName) ===
          normalizedSaleName(candidate.toAccountName))
    )
      return refuse("Choose two different accounts.")
    if (
      candidate.newToAccount &&
      (candidate.toMoneyAccountId ||
        normalizedSaleName(candidate.newToAccount.name) !==
          normalizedSaleName(candidate.toAccountName ?? ""))
    )
      return refuse("Review the destination account again.")
  }
  const result = generalActionSchema.safeParse(candidate)
  return result.success
    ? { ok: true, payload: result.data }
    : refuse(result.error.issues[0]?.message ?? "Check the draft details.")
}
