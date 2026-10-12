import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import { majorToMinor } from "@ewatrade/utils/currency"

/** Reviewed catalog and order changes the native editor can edit. */
export const nativeChangeActions = [
  "product_price_update",
  "product_details_update",
  "product_identifiers_update",
  "product_availability_update",
  "order_cancel",
  "order_metadata_update",
] as const
export type NativeChangeAction = Extract<
  GeneralAction,
  { action: (typeof nativeChangeActions)[number] }
>
export function isNativeChange(
  payload: GeneralAction,
): payload is NativeChangeAction {
  return (nativeChangeActions as readonly string[]).includes(payload.action)
}

/**
 * An optional field is kept (omitted), cleared (null) or set. Omitted and null
 * mean different things to the canonical command, so the editor never collapses
 * them into an empty string.
 */
export type FieldChoice = "keep" | "clear" | "set"
export function fieldChoice(value: unknown): FieldChoice {
  return value === undefined ? "keep" : value === null ? "clear" : "set"
}
/** Text input to patch value: emptied text clears; untouched stays omitted. */
export function textPatch(text: string): string | null {
  return text.trim() ? text : null
}

type Result =
  | { ok: true; payload: GeneralAction }
  | { ok: false; error: string }

/** Validate an edited draft exactly as the server will. */
export function nativeChangeCandidate(
  payload: NativeChangeAction,
  input: { price?: string; deliveryDueAt?: Date | null } = {},
): Result {
  let candidate: unknown = payload
  if (payload.action === "product_price_update") {
    const priceMinor = majorToMinor(input.price ?? "")
    if (priceMinor === null) return { ok: false, error: "Enter a valid price." }
    candidate = { ...payload, priceMinor }
  }
  if (
    payload.action === "order_metadata_update" &&
    typeof payload.patch.deliveryDueAt === "string"
  ) {
    const due = input.deliveryDueAt
    if (!due || !Number.isFinite(due.getTime()))
      return { ok: false, error: "Choose a delivery date and time." }
    candidate = {
      ...payload,
      patch: { ...payload.patch, deliveryDueAt: due.toISOString() },
    }
  }
  const parsed = generalActionSchema.safeParse(candidate)
  return parsed.success
    ? { ok: true, payload: parsed.data }
    : {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check the draft fields.",
      }
}
