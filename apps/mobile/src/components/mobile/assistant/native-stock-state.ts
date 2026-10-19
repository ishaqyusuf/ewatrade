import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type CustodySource,
  type StockCustodyMove,
  custodyMoveKind,
} from "@ewatrade/assistant/general/stock-custody"
import {
  type PackTargetInput,
  derivePackTargetResult,
} from "@ewatrade/assistant/general/stock-transform"
import { z } from "zod"

export type NativeStockBalance = NonNullable<
  RouterOutputs["inventory"]["balanceSource"]
>
export type NativeStockAssignees =
  RouterOutputs["inventory"]["custodyAssignees"]
export type NativeStockTransferReview =
  RouterOutputs["inventory"]["transferReview"]
export type NativeStockUnitConfigurations =
  RouterOutputs["catalog"]["listUnitConfigurations"]

/** Roles the stock capabilities allow; the server still checks Store grants. */
export const nativeStockRoles = ["OWNER", "ADMIN", "MANAGER"] as const

export type NativeStockScope = {
  tenantId: string
  storeId: string
  actorUserId: string
  role: string
}
const scopeId = z.string().min(1).max(128)
const tenantProjection = z.object({
  tenant: z.object({ id: scopeId }),
  activeStore: z.object({ id: scopeId, status: z.literal("ACTIVE") }),
  actorUserId: scopeId,
  membership: z.object({ tenantId: scopeId, role: z.string() }),
  stores: z.array(z.object({ id: scopeId, name: z.string() })),
})

/**
 * The server's fresh active business, Store, actor and role must equal the
 * signed-in profile; otherwise every stock read is treated as another scope.
 */
export function nativeStockScope(raw: unknown, expected: NativeStockScope) {
  const parsed = tenantProjection.safeParse(raw)
  if (!parsed.success) return null
  const current = parsed.data
  if (
    current.tenant.id !== expected.tenantId ||
    current.membership.tenantId !== expected.tenantId ||
    current.activeStore.id !== expected.storeId ||
    current.actorUserId !== expected.actorUserId ||
    current.membership.role !== expected.role ||
    !(nativeStockRoles as readonly string[]).includes(current.membership.role)
  )
    return null
  return {
    ...expected,
    stores: current.stores.map(({ id, name }) => ({ id, name })),
  }
}

/**
 * The drafted entered unit, only from the balance's own current
 * configuration. A superseded or missing unit is unavailable (no fallback).
 */
export function nativeStockEnteredUnit(
  configurations: NativeStockUnitConfigurations | null | undefined,
  balance: Pick<NativeStockBalance, "productId" | "configurationVersionId">,
  unitId: string,
) {
  const configuration = configurations?.find(
    (row) =>
      row.id === balance.configurationVersionId &&
      row.productId === balance.productId &&
      row.status === "current",
  )
  const unit = configuration?.units.find((row) => row.id === unitId)
  if (!unit) return null
  const scale = nativeStockScale({
    inventoryUnitTransactionScale: unit.transactionScale,
  })
  return { name: unit.name, factor: unit.factor, scale }
}

/** A receipt's exact original. Never falls back to a related catalog item. */
export type NativeStockOriginal =
  | { kind: "stock_operation"; operationId: string }
  | { kind: "stock_count"; stockCountId: string }
  | { kind: "stock_transfer"; transferId: string }
  | { kind: "inventory_closeout"; closeoutId: string }

const id = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= 128 &&
  value === value.trim()

export function nativeStockReceiptOriginal(receipt: {
  kind: string
  recordId: string
}): NativeStockOriginal | null {
  if (!id(receipt.recordId)) return null
  switch (receipt.kind) {
    case "inventory":
      return { kind: "stock_operation", operationId: receipt.recordId }
    case "stock_count":
      return { kind: "stock_count", stockCountId: receipt.recordId }
    case "stock_transfer":
      return { kind: "stock_transfer", transferId: receipt.recordId }
    case "inventory_closeout":
      return { kind: "inventory_closeout", closeoutId: receipt.recordId }
    default:
      return null
  }
}

/** A route opens only one exact, untrimmed id; arrays and blanks are refused. */
export function nativeStockOriginalParam(
  kind: NativeStockOriginal["kind"],
  raw: string | string[] | undefined,
): NativeStockOriginal | null {
  if (typeof raw !== "string" || !id(raw)) return null
  switch (kind) {
    case "stock_operation":
      return { kind, operationId: raw }
    case "stock_count":
      return { kind, stockCountId: raw }
    case "stock_transfer":
      return { kind, transferId: raw }
    case "inventory_closeout":
      return { kind, closeoutId: raw }
  }
}

export function nativeStockOriginalRoute(original: NativeStockOriginal) {
  switch (original.kind) {
    case "stock_operation":
      return {
        pathname: "/stock-operation/[operationId]" as const,
        params: { operationId: original.operationId },
      }
    case "stock_count":
      return {
        pathname: "/stock-count/[stockCountId]" as const,
        params: { stockCountId: original.stockCountId },
      }
    case "stock_transfer":
      return {
        pathname: "/stock-transfer/[transferId]" as const,
        params: { transferId: original.transferId },
      }
    case "inventory_closeout":
      return {
        pathname: "/inventory-closeout/[closeoutId]" as const,
        params: { closeoutId: original.closeoutId },
      }
  }
}

/**
 * Only the exact requested source in the current Store counts. A null row,
 * another Store or another id is unavailable (never a stale or default row).
 */
export function nativeStockBalance(
  raw: NativeStockBalance | null | undefined,
  expected: { storeId: string; balanceSourceId: string },
): NativeStockBalance | null {
  if (!raw) return null
  return raw.balanceSourceId === expected.balanceSourceId &&
    raw.storeId === expected.storeId
    ? raw
    : null
}

/** The unit scale the server re-parses at; unknown stays undefined (six-place schema still applies). */
export function nativeStockScale(
  balance: Pick<NativeStockBalance, "inventoryUnitTransactionScale">,
) {
  const scale = balance.inventoryUnitTransactionScale
  return Number.isInteger(scale) && scale >= 0 && scale <= 6 ? scale : undefined
}

/**
 * Cross-Store rules: dispatch and cancel are confirmed in the source Store,
 * receipt in the destination Store, and only while stock is in transit.
 */
export function nativeStockTransferGate(
  review: Pick<
    NativeStockTransferReview,
    "status" | "sourceStore" | "targetStore"
  >,
  action: "stock_transfer_receive" | "stock_transfer_cancel",
  activeStoreId: string,
) {
  if (review.status !== "IN_TRANSIT") return "not_in_transit" as const
  const owner =
    action === "stock_transfer_receive"
      ? review.targetStore
      : review.sourceStore
  return owner.id === activeStoreId
    ? ("ready" as const)
    : ("wrong_store" as const)
}

export type NativeStockChoice = { id: string; label: string; role: string }

/**
 * Current Store-eligible custody recipients. Identities are never merged:
 * a missing name reads as unavailable and equal name+role pairs are numbered.
 */
export function nativeStockCustodyChoices(
  response: NativeStockAssignees | null | undefined,
  storeId: string,
): NativeStockChoice[] | null {
  if (!response || response.storeId !== storeId) return null
  const base = response.assignees
    .filter((row) => id(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name?.trim() || "Name unavailable",
      role: String(row.role ?? "").toLowerCase(),
    }))
  const seen = new Map<string, number>()
  const totals = new Map<string, number>()
  for (const row of base)
    totals.set(
      `${row.name}|${row.role}`,
      (totals.get(`${row.name}|${row.role}`) ?? 0) + 1,
    )
  return base.map((row) => {
    const key = `${row.name}|${row.role}`
    const index = (seen.get(key) ?? 0) + 1
    seen.set(key, index)
    const suffix = (totals.get(key) ?? 0) > 1 ? ` · ${index}` : ""
    return {
      id: row.id,
      label: `${row.name}${row.role ? ` · ${row.role}` : ""}${suffix}`,
      role: row.role,
    }
  })
}

/** The shared canonical direction check; anything unsupported is refused. */
export function nativeStockCustodyKind(
  source: CustodySource,
  target: StockCustodyMove["target"],
) {
  try {
    return custodyMoveKind(source, target)
  } catch {
    return { refused: "This stock can't be moved here." }
  }
}

/** The same exact pack calculation the review uses; malformed facts fail closed. */
export function nativeStockPackPreview(input: PackTargetInput) {
  try {
    return derivePackTargetResult(input)
  } catch {
    return {
      ok: false as const,
      refused: "The pack sizes for this stock are unavailable.",
    }
  }
}
