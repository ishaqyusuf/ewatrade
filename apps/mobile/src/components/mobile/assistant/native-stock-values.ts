import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  minorToStatedAmount,
  statedAmountPattern,
  statedAmountToMinor,
} from "@ewatrade/assistant/general/stated-money"
import { parseStockEffectiveTime } from "@ewatrade/assistant/general/stock-effective-time"
import {
  compareExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import {
  type StockCategoryDraft,
  collectStockCategoryDraft,
} from "@ewatrade/utils/inventory-categories"
import { nativeIssueText } from "./native-validation-copy"

export const nativeStockActions = [
  "stock_receive",
  "stock_adjust",
  "stock_correct",
  "stock_count_create",
  "stock_count_finalize",
  "inventory_closeout_create",
  "inventory_closeout_finalize",
  "stock_transfer_dispatch",
  "stock_transfer_receive",
  "stock_transfer_cancel",
  "stock_custody_move",
  "stock_package_transform",
] as const
export type NativeStockActionName = (typeof nativeStockActions)[number]
export type NativeStockAction = Extract<
  GeneralAction,
  { action: NativeStockActionName }
>
type Of<Name extends NativeStockActionName> = Extract<
  NativeStockAction,
  { action: Name }
>
export type NativeStockResult<T = NativeStockAction> =
  | { ok: true; payload: T }
  | { ok: false; error: string }

export function isNativeStockAction(
  action: GeneralAction,
): action is NativeStockAction {
  return (nativeStockActions as readonly string[]).includes(action.action)
}

/**
 * Exact quantity text at the unit's own scale. `allowZero` is only for count
 * observations and closeout declarations. Unknown scale falls back to the
 * schema's six decimals; the server re-checks at the real unit scale.
 */
const places = (scale: number) =>
  `${scale} decimal place${scale === 1 ? "" : "s"}`

export function nativeStockQuantity(
  value: string,
  options: { scale?: number; allowZero?: boolean; label?: string } = {},
) {
  const text = value.trim()
  const label = options.label ?? "quantity"
  const scale = Math.min(Math.max(0, options.scale ?? 6), 6)
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(text)) {
    if (!text) throw Error(`Enter the ${label}.`)
    if (text.startsWith("-"))
      throw Error(
        options.allowZero
          ? `Enter a ${label} of zero or more.`
          : `Enter a ${label} above zero.`,
      )
    if (text.includes(",")) throw Error(`Enter the ${label} without commas.`)
    throw Error(
      scale === 0
        ? `Enter the ${label} as a whole number.`
        : `Enter the ${label} as a number with up to ${places(scale)}.`,
    )
  }
  try {
    parseExactDecimal(text, {
      maxScale: scale,
      allowZero: options.allowZero ?? false,
    })
  } catch {
    if (!options.allowZero && !/[1-9]/.test(text))
      throw Error(`Enter a ${label} above zero.`)
    throw Error(
      scale === 0
        ? `This unit counts whole numbers only. Enter a whole ${label}.`
        : `This unit allows up to ${places(scale)}.`,
    )
  }
  return text
}

/**
 * Blank omits the time, so the new review sets it. Anything typed must be an
 * exact UTC instant the stock commands can store without rounding; it is
 * kept exactly as typed (never normalized), even when it equals the draft.
 */
export function nativeStockEffectiveAt(value: string) {
  if (!value.trim()) return undefined
  parseStockEffectiveTime(value)
  return value
}

/** Major-unit cost text → exact minor units; blank stays unknown. */
export function nativeStockUnitCost(value: string) {
  const text = value.trim()
  if (!text) return undefined
  if (!statedAmountPattern.test(text))
    throw Error(
      "Enter the cost per unit with at most two decimal places, or leave it blank when unknown.",
    )
  return statedAmountToMinor(text) as number
}
export const nativeStockCostInput = (minor?: number) =>
  minor === undefined ? "" : minorToStatedAmount(minor)

function categories(
  drafted: StockCategoryDraft[],
  pending: string,
  required: boolean,
) {
  if (!drafted.length && !pending.trim()) {
    if (required) throw Error("Choose 1–10 categories.")
    return undefined
  }
  return collectStockCategoryDraft(drafted, pending).map(({ name }) => ({
    name,
  }))
}

function finish<T extends NativeStockAction>(
  candidate: unknown,
  name: T["action"],
  fallback: string,
): NativeStockResult<T> {
  const parsed = generalActionSchema.safeParse(candidate)
  if (parsed.success && parsed.data.action === name)
    return { ok: true, payload: parsed.data as T }
  return {
    ok: false,
    error: parsed.success
      ? fallback
      : nativeIssueText(parsed.error.issues[0] ?? {}, fallback),
  }
}
function guard<T extends NativeStockAction>(
  run: () => NativeStockResult<T>,
  fallback: string,
): NativeStockResult<T> {
  try {
    return run()
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error && cause.message ? cause.message : fallback,
    }
  }
}

export type ReceiveEdits = {
  quantity: string
  source: string
  supplier: string
  unitCost: string
  categories: StockCategoryDraft[]
  pendingCategory: string
  effectiveAt: string
  reason: string
}
export function nativeStockReceive(
  initial: Of<"stock_receive">,
  edits: ReceiveEdits,
  unit: { scale?: number } = {},
) {
  return guard(() => {
    const supplierName = edits.supplier.trim()
    const unitCostMinor = nativeStockUnitCost(edits.unitCost)
    const chosen = categories(edits.categories, edits.pendingCategory, false)
    const effectiveAt = nativeStockEffectiveAt(edits.effectiveAt)
    return finish<Of<"stock_receive">>(
      {
        action: "stock_receive",
        balanceSourceId: initial.balanceSourceId,
        enteredInventoryUnitId: initial.enteredInventoryUnitId,
        enteredQuantity: nativeStockQuantity(edits.quantity, unit),
        source: edits.source,
        ...(supplierName ? { supplierName } : {}),
        ...(unitCostMinor === undefined ? {} : { unitCostMinor }),
        ...(chosen ? { categories: chosen } : {}),
        ...(effectiveAt ? { effectiveAt } : {}),
        reason: edits.reason,
      },
      "stock_receive",
      "Check the receipt details.",
    )
  }, "Check the receipt details.")
}

export type AdjustEdits = {
  quantity: string
  direction: "increase" | "decrease"
  purpose: "adjustment" | "waste"
  categories: StockCategoryDraft[]
  pendingCategory: string
  effectiveAt: string
  reason: string
}
export function nativeStockAdjust(
  initial: Of<"stock_adjust">,
  edits: AdjustEdits,
  unit: { scale?: number } = {},
) {
  return guard(() => {
    const effectiveAt = nativeStockEffectiveAt(edits.effectiveAt)
    return finish<Of<"stock_adjust">>(
      {
        action: "stock_adjust",
        balanceSourceId: initial.balanceSourceId,
        enteredInventoryUnitId: initial.enteredInventoryUnitId,
        enteredQuantity: nativeStockQuantity(edits.quantity, unit),
        // Waste always removes stock.
        direction: edits.purpose === "waste" ? "decrease" : edits.direction,
        purpose: edits.purpose,
        categories: categories(edits.categories, edits.pendingCategory, true),
        ...(effectiveAt ? { effectiveAt } : {}),
        reason: edits.reason,
      },
      "stock_adjust",
      "Check the adjustment details.",
    )
  }, "Check the adjustment details.")
}

/** One replacement per original movement, each at that movement's saved scale. */
export function nativeStockCorrect(
  initial: Of<"stock_correct">,
  edits: { quantities: string[]; reason: string },
  scales: readonly (number | undefined)[] = [],
) {
  return guard(() => {
    if (edits.quantities.length !== initial.corrections.length)
      throw Error("Enter a replacement for every original movement.")
    return finish<Of<"stock_correct">>(
      {
        action: "stock_correct",
        targetOperationId: initial.targetOperationId,
        corrections: initial.corrections.map((entry, index) => ({
          movementId: entry.movementId,
          correctedEnteredQuantity: nativeStockQuantity(
            edits.quantities[index] ?? "",
            { scale: scales[index], label: "replacement quantity" },
          ),
        })),
        reason: edits.reason,
      },
      "stock_correct",
      "Check the corrections.",
    )
  }, "Check the corrections.")
}

/** Physical observations: zero is a real count. Sources and units stay fixed. */
export function nativeStockCountCreate(
  initial: Of<"stock_count_create">,
  edits: { quantities: string[][]; reason: string },
  scales: readonly (readonly (number | undefined)[])[] = [],
) {
  return guard(() => {
    if (
      edits.quantities.length !== initial.lines.length ||
      initial.lines.some(
        (line, index) =>
          (edits.quantities[index]?.length ?? -1) !== line.entries.length,
      )
    )
      throw Error("Enter a counted quantity for every observation.")
    return finish<Of<"stock_count_create">>(
      {
        action: "stock_count_create",
        lines: initial.lines.map((line, lineIndex) => ({
          balanceSourceId: line.balanceSourceId,
          entries: line.entries.map((entry, entryIndex) => ({
            enteredInventoryUnitId: entry.enteredInventoryUnitId,
            enteredQuantity: nativeStockQuantity(
              edits.quantities[lineIndex]?.[entryIndex] ?? "",
              {
                scale: scales[lineIndex]?.[entryIndex],
                allowZero: true,
                label: "counted quantity",
              },
            ),
          })),
        })),
        reason: edits.reason,
      },
      "stock_count_create",
      "Check the counted quantities.",
    )
  }, "Check the counted quantities.")
}

export function nativeStockCloseoutCreate(
  initial: Of<"inventory_closeout_create">,
  edits: { quantities: string[]; reason: string },
  scales: readonly (number | undefined)[] = [],
) {
  return guard(() => {
    if (edits.quantities.length !== initial.declarations.length)
      throw Error("Enter a declared quantity for every source.")
    return finish<Of<"inventory_closeout_create">>(
      {
        action: "inventory_closeout_create",
        custodyType: initial.custodyType,
        custodyReferenceId: initial.custodyReferenceId,
        declarations: initial.declarations.map((line, index) => ({
          balanceSourceId: line.balanceSourceId,
          declaredQuantity: nativeStockQuantity(edits.quantities[index] ?? "", {
            scale: scales[index],
            allowZero: true,
            label: "declared quantity",
          }),
        })),
        reason: edits.reason,
      },
      "inventory_closeout_create",
      "Check the declared quantities.",
    )
  }, "Check the declared quantities.")
}

/** Reason-only actions: the saved record and its quantities stay fixed. */
export function nativeStockReasonOnly(
  initial:
    | Of<"stock_count_finalize">
    | Of<"inventory_closeout_finalize">
    | Of<"stock_transfer_cancel">,
  edits: { reason: string },
): NativeStockResult {
  return guard(
    () =>
      finish(
        { ...initial, reason: edits.reason },
        initial.action,
        "Check the reason.",
      ),
    "Check the reason.",
  )
}

export function nativeStockTransferQuantity(
  initial: Of<"stock_transfer_dispatch"> | Of<"stock_transfer_receive">,
  edits: { quantity: string; reason: string },
  unit: { scale?: number; max?: { quantity: string; unitName: string } } = {},
): NativeStockResult {
  return guard(() => {
    const quantity = nativeStockQuantity(edits.quantity, unit)
    // A receipt can't exceed what is in transit; the fresh review still decides.
    if (unit.max && compareExactDecimals(quantity, unit.max.quantity) > 0)
      throw Error(
        `Only ${unit.max.quantity} ${unit.max.unitName} is in transit. Enter that much or less.`,
      )
    return finish(
      { ...initial, quantity, reason: edits.reason },
      initial.action,
      "Check the transfer details.",
    )
  }, "Check the transfer details.")
}

/**
 * Direction is fixed by the draft. An assignment may pick another current
 * eligible staff identity; a return always goes back to the Store.
 */
export function nativeStockCustody(
  initial: Of<"stock_custody_move">,
  edits: { userId?: string; quantity: string; reason: string },
  options: { scale?: number; eligibleUserIds?: readonly string[] } = {},
) {
  return guard(() => {
    const userId =
      initial.target.type === "staff"
        ? (edits.userId ?? initial.target.userId)
        : undefined
    const result = finish<Of<"stock_custody_move">>(
      {
        action: "stock_custody_move",
        sourceBalanceSourceId: initial.sourceBalanceSourceId,
        target:
          userId === undefined ? initial.target : { type: "staff", userId },
        quantity: nativeStockQuantity(edits.quantity, options),
        reason: edits.reason,
      },
      "stock_custody_move",
      "Check the custody move.",
    )
    // Field errors come first; eligibility is checked once the draft is valid.
    if (
      result.ok &&
      userId !== undefined &&
      !options.eligibleUserIds?.includes(userId)
    )
      return {
        ok: false,
        error:
          "Choose a staff member from the current eligible list for this Store.",
      }
    return result
  }, "Check the custody move.")
}

/** Only the source packs are edited; the server derives the exact target. */
export function nativeStockTransform(
  initial: Of<"stock_package_transform">,
  edits: { sourceQuantity: string; reason: string },
  unit: { scale?: number } = {},
) {
  return guard(
    () =>
      finish<Of<"stock_package_transform">>(
        {
          action: "stock_package_transform",
          sourceBalanceSourceId: initial.sourceBalanceSourceId,
          targetBalanceSourceId: initial.targetBalanceSourceId,
          sourceQuantity: nativeStockQuantity(edits.sourceQuantity, {
            ...unit,
            label: "number of source packs",
          }),
          reason: edits.reason,
        },
        "stock_package_transform",
        "Check the repack details.",
      ),
    "Check the repack details.",
  )
}
