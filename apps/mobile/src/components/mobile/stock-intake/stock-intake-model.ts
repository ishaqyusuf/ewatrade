import type { ParsedStockIntakeTarget } from "@/lib/stock-intake-target"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import {
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import {
  type StockCategoryDraft,
  collectStockCategoryDraft,
  stockCategorySelectors,
} from "@ewatrade/utils/inventory-categories"
import { stockAfter } from "./stock-preview"

export type StockBalance =
  RouterOutputs["inventory"]["balanceReport"]["rows"][number]
export type StockPerson = RouterOutputs["services"]["assignees"][number]
export type StockIntakeProps = {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
  /** Requested origin (Catalog Item etc.). Absent means generic entry. */
  target?: ParsedStockIntakeTarget
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
    description: "Count stock, then confirm any difference.",
  },
  {
    key: "adjustment",
    label: "Adjust",
    description: "Increase or decrease an exact balance with categories.",
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
  categories: StockCategoryDraft[]
  categoryInput: string
  direction: "increase" | "decrease"
  targetCustodyType: "staff" | "store"
  targetCustodyReferenceId: string
}
export const INITIAL_STOCK_DRAFT: StockDraft = {
  mode: "receipt",
  balanceId: "",
  quantity: "",
  reason: "",
  categories: [],
  categoryInput: "",
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
  /** Once a response was lost, later rejections cannot prove nothing saved. */
  uncertain?: boolean
}
/** Every outcome keeps the reviewed snapshot it describes. */
export type StockOutcome = { review: StockReview } & (
  | {
      kind: "recorded"
      effectiveAt: Date | null
      /** The saved operation's id from the actual response; null if unreadable. */
      operationId: string | null
      /** Balance read time when the command resolved; later reads are post-result. */
      readBaseline: number
    }
  | { kind: "not_recorded"; message: string; canEdit: boolean }
  | { kind: "unknown" }
)

/** Exact quantity line for review and outcome, e.g. "Receive 10 bag". */
export function stockQuantityLine(
  draft: StockDraft,
  quantity: string,
  unit: string,
) {
  const verb =
    draft.mode === "count"
      ? "Counted"
      : draft.mode === "custody"
        ? "Move"
        : draft.mode === "receipt"
          ? "Receive"
          : draft.direction === "increase"
            ? "Increase"
            : "Decrease"
  return `${verb} ${quantity} ${unit}`
}

function effectiveDate(result: unknown) {
  const value =
    result && typeof result === "object" && "effectiveAt" in result
      ? (result as { effectiveAt?: unknown }).effectiveAt
      : undefined
  if (!(typeof value === "string" || value instanceof Date)) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
export { effectiveDate as stockResultEffectiveAt }

/**
 * The saved operation's own id, read only from the actual command response.
 * Never derived from client, final or Count draft ids; anything malformed is
 * null so a saved command stays recorded with its reference unavailable.
 */
export function stockResultOperationId(result: unknown) {
  const value =
    result && typeof result === "object" && "id" in result
      ? (result as { id?: unknown }).id
      : undefined
  if (typeof value !== "string") return null
  const id = value.trim()
  return id.length >= 1 && id.length <= 128 && /^[A-Za-z0-9_-]+$/.test(id)
    ? id
    : null
}

/** Recorded-outcome reference row; a missing id never implies a failure. */
export function stockReferenceRow(
  operationId: string | null,
): [string, string, { selectable: boolean }] {
  return [
    "Reference",
    operationId ?? "Not available on this phone — the change is saved",
    // Only a real saved id is worth copying.
    { selectable: operationId !== null },
  ]
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

/** Shared pool and packaged sources are independent balances; never merge. */
export function stockKindLabel(balance: Pick<StockBalance, "kind">) {
  return balance.kind === "PACKAGED_STOCK" ? "Packaged stock" : "Shared stock"
}

/** On hand, reserved and available are distinct facts in the same unit. */
export function stockFactsLabel(
  balance: Pick<
    StockBalance,
    | "onHandQuantity"
    | "reservedQuantity"
    | "availableQuantity"
    | "inventoryUnitName"
  >,
) {
  return `${balance.onHandQuantity} on hand · ${balance.reservedQuantity} reserved · ${balance.availableQuantity} available ${balance.inventoryUnitName}`
}

export function stockDraftReadiness(
  draft: StockDraft,
  balance: StockBalance | undefined,
  people: StockPerson[],
) {
  if (!balance)
    return { error: "Choose an exact stock balance.", quantity: null }
  if (draft.mode === "receipt" || draft.mode === "adjustment") {
    try {
      collectStockCategoryDraft(draft.categories, draft.categoryInput)
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Choose categories.",
        quantity: null,
      }
    }
  } else if (!draft.reason.trim() || draft.reason.trim().length > 500)
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
      categories: stockCategorySelectors(
        collectStockCategoryDraft(draft.categories, draft.categoryInput),
      ),
      type: draft.mode,
      direction: draft.mode === "receipt" ? "increase" : draft.direction,
    },
  }
}

/** Review estimate only; the server confirms the real balance. */
export function stockReviewLedger(review: StockReview) {
  const { balance, draft, quantity } = review
  const after = stockAfter(
    balance.onHandQuantity,
    quantity,
    draft.mode,
    draft.direction,
  )
  let availableAfter: string | null = null
  if (after !== null)
    if (balance.custodyType === "TRANSIT") availableAfter = "0"
    else {
      const value = subtractExactDecimals(after, balance.reservedQuantity)
      availableAfter = value.startsWith("-") ? "0" : value
    }
  const difference =
    after === null ? null : subtractExactDecimals(after, balance.onHandQuantity)
  return {
    onHand: [balance.onHandQuantity, after] as const,
    reserved: [balance.reservedQuantity, balance.reservedQuantity] as const,
    available: [balance.availableQuantity, availableAfter] as const,
    difference:
      difference === null
        ? null
        : difference.startsWith("-")
          ? `−${difference.slice(1)}`
          : difference === "0"
            ? "0"
            : `+${difference}`,
  }
}
