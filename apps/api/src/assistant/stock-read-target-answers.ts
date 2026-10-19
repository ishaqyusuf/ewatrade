import { createHash } from "node:crypto"
import {
  type GeneralAnswer,
  generalAnswerSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  type StockReadTarget,
  stockOperationReadTargetSchema,
  stockReadTargetSchema,
} from "@ewatrade/assistant/general/stock-read-target"
import {
  inventoryCloseoutReadAnswers,
  inventoryCloseoutsReadAnswers,
  stockCountReadAnswers,
  stockOperationReadAnswers,
  stockOperationsReadAnswers,
  stockTransferReadAnswers,
  stockTransfersReadAnswers,
} from "./whatsapp-reads/inventory-operation-answers"

export type StockReadAnswerOrigin = StockReadTarget["origin"]

export class StockReadTargetAnswerError extends Error {
  constructor() {
    super("The exact saved stock original is unavailable for this read.")
    this.name = "StockReadTargetAnswerError"
  }
}
function refuse(): never {
  throw new StockReadTargetAnswerError()
}
function identity(value: unknown) {
  const parsed =
    stockOperationReadTargetSchema.shape.operationId.safeParse(value)
  if (!parsed.success) refuse()
  return parsed.data
}
function originSnapshot(value: StockReadAnswerOrigin) {
  const parsed = stockOperationReadTargetSchema.shape.origin.safeParse(value)
  if (!parsed.success) refuse()
  return parsed.data
}
function scoped(row: object, origin: StockReadAnswerOrigin) {
  if (
    "tenantId" in row &&
    identity(Reflect.get(row, "tenantId")) !== origin.tenantId
  )
    refuse()
  if (
    "storeId" in row &&
    identity(Reflect.get(row, "storeId")) !== origin.storeId
  )
    refuse()
}
function storeScoped(row: { storeId: string }, origin: StockReadAnswerOrigin) {
  scoped(row, origin)
  if (identity(row.storeId) !== origin.storeId) refuse()
}
function target(value: StockReadTarget) {
  // Validate before the GENERAL optional target parser can discard bad metadata.
  const parsed = stockReadTargetSchema.safeParse(value)
  if (!parsed.success) refuse()
  return parsed.data
}
function bind(
  bindings: Map<string, StockReadTarget>,
  answerId: string,
  original: StockReadTarget,
) {
  if (bindings.has(answerId)) refuse()
  bindings.set(answerId, original)
}
function compose(
  answers: GeneralAnswer[],
  bindings: Map<string, StockReadTarget>,
  origin: StockReadAnswerOrigin,
  targetless: string[] = [],
) {
  const seen = new Set<string>()
  const finalIds = new Set<string>()
  return answers.map((answer) => {
    if (seen.has(answer.id) || answer.target !== undefined) refuse()
    seen.add(answer.id)
    const original = bindings.get(answer.id)
    if (!original && !targetless.includes(answer.id)) refuse()
    // Only the ephemeral card key is bounded. Never truncate an original record
    // identity, fact, or target. The full original key and provenance stay bound.
    const id =
      answer.id.length <= 128
        ? answer.id
        : `stock_answer_${createHash("sha256")
            .update(
              JSON.stringify({
                domain: "assistant_stock_answer_card:v1",
                originalKey: answer.id,
                origin,
                target: original ?? null,
              }),
            )
            .digest("hex")}`
    if (finalIds.has(id)) refuse()
    finalIds.add(id)
    const parsed = generalAnswerSchema.safeParse({
      ...answer,
      id,
      ...(original ? { target: original } : {}),
    })
    if (!parsed.success) refuse()
    if (original) {
      const retained = stockReadTargetSchema.safeParse(parsed.data.target)
      if (
        !retained.success ||
        JSON.stringify(retained.data) !== JSON.stringify(original)
      )
        refuse()
    }
    return parsed.data
  })
}
function distinct(ids: string[]) {
  if (new Set(ids).size !== ids.length) refuse()
}
function transferScope(
  row: {
    sourceStore: { id: string; tenantId?: string }
    targetStore: { id: string; tenantId?: string }
  },
  origin: StockReadAnswerOrigin,
  mode: "list" | "detail",
) {
  scoped(row, origin)
  const sourceId = identity(row.sourceStore?.id)
  const destinationId = identity(row.targetStore?.id)
  if (
    sourceId === destinationId ||
    ![sourceId, destinationId].includes(origin.storeId)
  )
    refuse()
  // The protected list DTO has endpoint IDs but no Tenant echo. Its exact
  // protected request supplies origin; reject any exposed foreign Tenant too.
  // Exact detail always carries both Tenant IDs and must prove both matches.
  for (const endpoint of [row.sourceStore, row.targetStore])
    if (
      (mode === "detail" || "tenantId" in endpoint) &&
      identity(endpoint.tenantId) !== origin.tenantId
    )
      refuse()
}

/**
 * Unintegrated projection wrappers only: protected DTO + exact protected request
 * origin, never a read/confirmation authority grant. No quantity or label logic is
 * duplicated. Summary cards stay targetless and every child opens its own parent.
 */
export function stockOperationsReadAnswersWithTargets(
  rows: Parameters<typeof stockOperationsReadAnswers>[0],
  requestedOrigin: StockReadAnswerOrigin,
  storeLabel: string,
  asOf?: string,
): GeneralAnswer[] {
  const origin = originSnapshot(requestedOrigin)
  const bindings = new Map<string, StockReadTarget>()
  distinct(rows.map((row) => identity(row.id)))
  for (const row of rows) {
    storeScoped(row, origin)
    const original = target({
      kind: "stock_operation",
      operationId: identity(row.id),
      origin,
    })
    bind(bindings, `stock_operation_${row.id}`, original)
  }
  return compose(
    stockOperationsReadAnswers(rows, storeLabel, asOf),
    bindings,
    origin,
    ["stock_operations"],
  )
}

export function stockOperationReadAnswersWithTargets(
  row: Parameters<typeof stockOperationReadAnswers>[0],
  requestedOrigin: StockReadAnswerOrigin,
  storeLabel: string,
  asOf?: string,
): GeneralAnswer[] {
  const origin = originSnapshot(requestedOrigin)
  const bindings = new Map<string, StockReadTarget>()
  if (row) {
    storeScoped(row, origin)
    const original = target({
      kind: "stock_operation",
      operationId: identity(row.id),
      origin,
    })
    bind(bindings, `stock_operation_${row.id}`, original)
    for (const movement of row.movements) {
      const id = identity(movement.id)
      bind(bindings, `stock_movement_${id}`, original)
      bind(bindings, `stock_movement_evidence_${id}`, original)
    }
  }
  return compose(
    stockOperationReadAnswers(row, storeLabel, asOf),
    bindings,
    origin,
    ["stock_operation_unavailable"],
  )
}

export function stockCountReadAnswersWithTargets(
  row: Parameters<typeof stockCountReadAnswers>[0],
  requestedOrigin: StockReadAnswerOrigin,
  storeLabel: string,
  asOf?: string,
): GeneralAnswer[] {
  const origin = originSnapshot(requestedOrigin)
  storeScoped(row, origin)
  const original = target({
    kind: "stock_count",
    stockCountId: identity(row.id),
    origin,
  })
  const bindings = new Map<string, StockReadTarget>()
  bind(bindings, `stock_count_${row.id}`, original)
  for (const line of row.lines) {
    const id = identity(line.id)
    bind(bindings, `stock_count_line_${id}`, original)
    for (const [index] of line.entries.entries())
      bind(bindings, `stock_count_entry_${id}_${index}`, original)
  }
  return compose(stockCountReadAnswers(row, storeLabel, asOf), bindings, origin)
}

export function inventoryCloseoutsReadAnswersWithTargets(
  rows: Parameters<typeof inventoryCloseoutsReadAnswers>[0],
  requestedOrigin: StockReadAnswerOrigin,
  storeLabel: string,
  asOf?: string,
): GeneralAnswer[] {
  const origin = originSnapshot(requestedOrigin)
  const bindings = new Map<string, StockReadTarget>()
  distinct(rows.map((row) => identity(row.id)))
  // This protected list DTO has no Store echo. The caller must preserve its exact
  // authorized list-request origin; neither labels nor row contents infer it.
  for (const row of rows) {
    scoped(row, origin)
    const original = target({
      kind: "inventory_closeout",
      closeoutId: identity(row.id),
      origin,
    })
    bind(bindings, `inventory_closeout_${row.id}`, original)
  }
  return compose(
    inventoryCloseoutsReadAnswers(rows, storeLabel, asOf),
    bindings,
    origin,
    ["inventory_closeouts"],
  )
}

export function inventoryCloseoutReadAnswersWithTargets(
  row: Parameters<typeof inventoryCloseoutReadAnswers>[0],
  requestedOrigin: StockReadAnswerOrigin,
  storeLabel: string,
  asOf?: string,
): GeneralAnswer[] {
  const origin = originSnapshot(requestedOrigin)
  storeScoped(row, origin)
  const original = target({
    kind: "inventory_closeout",
    closeoutId: identity(row.id),
    origin,
  })
  const bindings = new Map<string, StockReadTarget>()
  bind(bindings, `inventory_closeout_${row.id}`, original)
  for (const line of row.lines)
    bind(bindings, `inventory_closeout_line_${identity(line.id)}`, original)
  return compose(
    inventoryCloseoutReadAnswers(row, storeLabel, asOf),
    bindings,
    origin,
  )
}

export function stockTransfersReadAnswersWithTargets(
  rows: Parameters<typeof stockTransfersReadAnswers>[0],
  requestedOrigin: StockReadAnswerOrigin,
  storeLabel: string,
  asOf?: string,
): GeneralAnswer[] {
  const origin = originSnapshot(requestedOrigin)
  const bindings = new Map<string, StockReadTarget>()
  distinct(rows.map((row) => identity(row.id)))
  for (const row of rows) {
    transferScope(row, origin, "list")
    const original = target({
      kind: "stock_transfer",
      transferId: identity(row.id),
      origin,
    })
    bind(bindings, `stock_transfer_${row.id}`, original)
  }
  return compose(
    stockTransfersReadAnswers(rows, storeLabel, asOf),
    bindings,
    origin,
    ["stock_transfers"],
  )
}

export function stockTransferReadAnswersWithTargets(
  row: Parameters<typeof stockTransferReadAnswers>[0],
  requestedOrigin: StockReadAnswerOrigin,
  storeLabel: string,
  asOf?: string,
): GeneralAnswer[] {
  const origin = originSnapshot(requestedOrigin)
  transferScope(row, origin, "detail")
  const original = target({
    kind: "stock_transfer",
    transferId: identity(row.id),
    origin,
  })
  const bindings = new Map<string, StockReadTarget>()
  bind(bindings, `stock_transfer_${row.id}`, original)
  // Current balance and acknowledgment-count summaries remain targetless.
  for (const event of row.acknowledgments)
    bind(bindings, `stock_transfer_ack_${identity(event.id)}`, original)
  return compose(
    stockTransferReadAnswers(row, storeLabel, asOf),
    bindings,
    origin,
    [`stock_transfer_balances_${row.id}`, `stock_transfer_history_${row.id}`],
  )
}
