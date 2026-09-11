import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import {
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

export type StockBalance =
  RouterOutputs["inventory"]["balanceReport"]["rows"][number]
export type StockPerson = RouterOutputs["services"]["assignees"][number]
export type StockIntakeProps = {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}
export const STOCK_MODES = [
  {
    key: "receipt",
    label: "Receive",
    description: "Record stock arriving at this balance.",
  },
  {
    key: "count",
    label: "Count",
    description: "Record an observed quantity, then finalize its variance.",
  },
  {
    key: "adjustment",
    label: "Adjust",
    description: "Increase or decrease an exact balance with a reason.",
  },
  {
    key: "custody",
    label: "Move",
    description: "Move custody within this Store, not between Stores.",
  },
] as const
export type StockMode = (typeof STOCK_MODES)[number]["key"]
export type StockDraft = {
  mode: StockMode
  balanceId: string
  quantity: string
  reason: string
  direction: "increase" | "decrease"
  targetCustodyType: "staff" | "store"
  targetCustodyReferenceId: string
}
export const INITIAL_STOCK_DRAFT: StockDraft = {
  mode: "receipt",
  balanceId: "",
  quantity: "",
  reason: "",
  direction: "increase",
  targetCustodyType: "staff",
  targetCustodyReferenceId: "",
}
export type StockReview = {
  balance: StockBalance
  draft: StockDraft
  quantity: string
  recipientName: string
  businessId: string
  userId: string
  storeId: string
}
export type StockCommand =
  | {
      kind: "balance"
      input: RouterInputs["inventory"]["postBalanceOperation"]
    }
  | { kind: "count"; input: RouterInputs["inventory"]["createStockCount"] }
  | { kind: "custody"; input: RouterInputs["inventory"]["moveCustody"] }
export type StockAttempt = {
  review: StockReview
  command: StockCommand
  finalId: string
  countId?: string
}

export function stockCustodyLabel(
  balance: StockBalance,
  people: StockPerson[] = [],
) {
  if (balance.custodyType === "STORE") return "Central store"
  const person =
    balance.custodyType === "STAFF"
      ? people.find((person) => person.id === balance.custodyReferenceId)
      : undefined
  const label =
    balance.custodyType === "STAFF"
      ? "Staff"
      : balance.custodyType === "TRANSIT"
        ? "In transit"
        : "Session"
  return `${label}: ${person?.name ?? balance.custodyReferenceId ?? "Unspecified"}`
}

export function stockDraftReadiness(
  draft: StockDraft,
  balance: StockBalance | undefined,
  people: StockPerson[],
) {
  if (!balance)
    return { error: "Choose an exact stock balance.", quantity: null }
  if (!draft.reason.trim() || draft.reason.trim().length > 500)
    return { error: "Add a reason of 1–500 characters.", quantity: null }
  if (draft.mode === "custody") {
    if (
      draft.targetCustodyType === "staff" &&
      !people.some((person) => person.id === draft.targetCustodyReferenceId)
    )
      return {
        error: "Choose an available team member receiving custody.",
        quantity: null,
      }
    if (
      (draft.targetCustodyType === "store" &&
        balance.custodyType === "STORE") ||
      (draft.targetCustodyType === "staff" &&
        balance.custodyType === "STAFF" &&
        balance.custodyReferenceId === draft.targetCustodyReferenceId)
    )
      return {
        error: "Choose a different custody destination.",
        quantity: null,
      }
  }
  try {
    const quantity = parseExactDecimal(draft.quantity.trim(), {
      allowZero: false,
      maxScale: Math.min(
        EXACT_QUANTITY_MAX_SCALE,
        balance.inventoryUnitTransactionScale,
      ),
    })
    return { error: null, quantity }
  } catch (error) {
    return {
      error:
        draft.mode === "count" && draft.quantity.trim() === "0"
          ? "The current Stock Count API does not accept zero observations. No count has been sent."
          : error instanceof Error
            ? error.message
            : "Enter a positive exact quantity in the displayed unit.",
      quantity: null,
    }
  }
}

export function stockCommand(
  review: StockReview,
  clientOperationId: string,
): StockCommand {
  const { balance, draft, quantity, storeId } = review
  if (draft.mode === "count")
    return {
      kind: "count",
      input: {
        clientOperationId,
        schemaVersion: 1,
        storeId,
        actorNote: draft.reason,
        lines: [
          {
            balanceSourceId: balance.balanceSourceId,
            expectedRevision: balance.revision,
            entries: [
              {
                enteredInventoryUnitId: balance.inventoryUnitId,
                enteredQuantity: quantity,
              },
            ],
          },
        ],
      },
    }
  if (draft.mode === "custody")
    return {
      kind: "custody",
      input: {
        clientOperationId,
        schemaVersion: 1,
        source: "mobile_inventory",
        sourceBalanceSourceId: balance.balanceSourceId,
        expectedSourceRevision: balance.revision,
        quantity,
        reason: draft.reason,
        targetCustodyType: draft.targetCustodyType,
        targetCustodyReferenceId:
          draft.targetCustodyType === "store"
            ? ""
            : draft.targetCustodyReferenceId,
      },
    }
  return {
    kind: "balance",
    input: {
      clientOperationId,
      schemaVersion: 1,
      source: "mobile_inventory",
      storeId,
      balanceSourceId: balance.balanceSourceId,
      enteredInventoryUnitId: balance.inventoryUnitId,
      enteredQuantity: quantity,
      expectedBalanceRevision: balance.revision,
      expectedConfigurationVersionId: balance.configurationVersionId,
      reason: draft.reason,
      type: draft.mode,
      direction: draft.mode === "receipt" ? "increase" : draft.direction,
    },
  }
}
