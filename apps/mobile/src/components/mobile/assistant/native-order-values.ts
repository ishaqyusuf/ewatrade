import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  statedAmountPattern,
  statedAmountToMinor,
} from "@ewatrade/assistant/general/stated-money"
import { minorToMajorInput } from "@ewatrade/utils/currency"
import { nativeIssueText } from "./native-validation-copy"

export const nativeOrderActions = [
  "order_replace",
  "product_line_fulfill",
  "product_batch_fulfill",
  "service_line_authorize",
  "service_line_fulfill",
  "product_line_return",
] as const
export type NativeOrderAction = Extract<
  GeneralAction,
  { action: (typeof nativeOrderActions)[number] }
>
export function isNativeOrderAction(
  payload: GeneralAction,
): payload is NativeOrderAction {
  return (nativeOrderActions as readonly string[]).includes(payload.action)
}
export type ReplacementInput = { quantity: string; amount: string }
export type ReplacementSource = {
  id: string
  snapshot: { pricingPolicy: string | null } | null
}
export function replacementInputs(
  initial: Extract<NativeOrderAction, { action: "order_replace" }>,
): ReplacementInput[] {
  return initial.changes.map((line) => ({
    quantity: line.quantity ?? "",
    amount:
      line.unitPriceMinor !== undefined
        ? minorToMajorInput(line.unitPriceMinor)
        : line.enteredTotalMinor !== undefined
          ? minorToMajorInput(line.enteredTotalMinor)
          : "",
  }))
}

/** UI fields can change values, never the selected action, Order, line or stock identities. */
export function nativeOrderCandidate(
  initial: NativeOrderAction,
  edits: {
    reason: string
    quantity?: string
    disposition?: Extract<
      NativeOrderAction,
      { action: "product_line_return" }
    >["disposition"]
    destination?: "reviewed" | "original"
    changes?: readonly ReplacementInput[]
    sources?: readonly ReplacementSource[]
  },
): { ok: true; payload: GeneralAction } | { ok: false; error: string } {
  let candidate: unknown = { ...initial, reason: edits.reason }
  if (initial.action === "order_replace") {
    if (edits.changes?.length !== initial.changes.length)
      return { ok: false, error: "Review every selected order item." }
    const changes: Extract<
      NativeOrderAction,
      { action: "order_replace" }
    >["changes"] = []
    for (const [index, line] of initial.changes.entries()) {
      const matches = edits.sources?.filter(
        (source) => source.id === line.orderLineId,
      )
      const source = matches?.length === 1 ? matches[0] : undefined
      if (
        !source?.snapshot ||
        !["fixed", "order_total"].includes(source.snapshot.pricingPolicy ?? "")
      )
        return {
          ok: false,
          error: "Reload the original order items before saving.",
        }
      const edit = edits.changes[index]
      if (!edit)
        return { ok: false, error: "Review every selected order item." }
      const enteredAmount = edit.amount.trim()
      if (enteredAmount && !statedAmountPattern.test(enteredAmount))
        return {
          ok: false,
          error: "Enter a valid price with at most two decimal places.",
        }
      const amount = enteredAmount
        ? Number(statedAmountToMinor(enteredAmount))
        : undefined
      changes.push({
        orderLineId: line.orderLineId,
        quantity: edit.quantity.trim() || undefined,
        ...(source.snapshot.pricingPolicy === "order_total"
          ? { enteredTotalMinor: amount }
          : { unitPriceMinor: amount }),
      })
    }
    candidate = { ...initial, reason: edits.reason, changes }
  }
  if (initial.action === "product_line_return") {
    const disposition = edits.disposition ?? initial.disposition
    candidate = {
      ...initial,
      reason: edits.reason,
      quantity: edits.quantity?.trim() ?? initial.quantity,
      disposition,
      destinationBalanceSourceId:
        disposition === "restock" && edits.destination !== "original"
          ? initial.destinationBalanceSourceId
          : undefined,
    }
  }
  const parsed = generalActionSchema.safeParse(candidate)
  return parsed.success
    ? { ok: true, payload: parsed.data }
    : {
        ok: false,
        error: nativeIssueText(
          parsed.error.issues[0] ?? {},
          "Check the draft fields.",
        ),
      }
}
