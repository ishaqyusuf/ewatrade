import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import type { createGeneralDomainCaller } from "../general-callers"

type Inventory = ReturnType<typeof createGeneralDomainCaller>["inventory"]
type Count = Awaited<ReturnType<Inventory["stockCountReview"]>>
type Operation = Awaited<ReturnType<Inventory["operationAudit"]>>
type Operations = Awaited<ReturnType<Inventory["operationHistory"]>>
type Closeouts = Awaited<ReturnType<Inventory["closeouts"]>>
type Closeout = Awaited<ReturnType<Inventory["closeoutReview"]>>
type Transfers = Awaited<ReturnType<Inventory["transfers"]>>
type Transfer = Awaited<ReturnType<Inventory["transferReview"]>>
const MAX_ROWS = 5

function label(value: string, max = 80) {
  if (value.length <= max) return value
  let result = ""
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(value)) {
    if (result.length + segment.length > max - 1) break
    result += segment
  }
  return `${result}…`
}
function quantity(value: string) {
  if (value.length > 64) throw Error("Exact inventory quantity unavailable")
  parseExactDecimal(value, { allowNegative: true, maxScale: 18 })
  return value
}
function answer(
  id: string,
  title: string,
  value: string,
  detail: string,
  store: string,
  asOf: string,
): GeneralAnswer {
  // Never clip numerical facts, record IDs or retained evidence to make a card fit.
  if (value.length > 160 || detail.length > 1000)
    throw Error("Inventory facts exceed the answer bound")
  return {
    id,
    title: label(title, 160),
    value,
    detail,
    scope: label(store, 400),
    asOf,
  }
}
const recent =
  "Limited recent snapshot, not complete history or a total. This reader has no older-page cursor. Labels may be shortened."
const shown = (count: number) =>
  `${Math.min(count, MAX_ROWS)} of ${count} returned records shown; open the original record in EwaTrade for omitted detail.`
const lineage = (ids: string[]) =>
  ids.length
    ? `${ids.slice(0, 2).join(", ")}${ids.length > 2 ? ` (${ids.length} linked records; first 2 IDs shown)` : ""}`
    : "None returned"

export function stockOperationsReadAnswers(
  rows: Operations,
  store: string,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  return [
    answer(
      "stock_operations",
      "Recent stock operations",
      `${rows.length} returned`,
      `${recent} ${shown(rows.length)} Read the exact operation ID for original movements, conversion and correction evidence. Do not add unlike units or treat operation net effects as current stock.`,
      store,
      asOf,
    ),
    ...rows
      .slice(0, MAX_ROWS)
      .map((row) =>
        answer(
          `stock_operation_${row.id}`,
          row.type,
          `${row.movementCount} original movements`,
          `Operation ${row.id}. Effective ${row.effectiveAt.toISOString()}; recorded ${row.createdAt.toISOString()}. Source: ${label(row.source)}. Reason: ${label(row.reason ?? "Not supplied", 200)}. Recorded movement count, not current quantity, saleability, correction eligibility or financial posting.`,
          store,
          asOf,
        ),
      ),
  ]
}

export function stockOperationReadAnswers(
  row: Operation,
  store: string,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  if (!row)
    return [
      answer(
        "stock_operation_unavailable",
        "Saved stock operation",
        "Unavailable",
        "Operation not found in the current Store. Missing evidence is not a zero stock effect.",
        store,
        asOf,
      ),
    ]
  const answers = [
    answer(
      `stock_operation_${row.id}`,
      "Saved stock operation",
      row.type,
      `Operation ${row.id}. Effective ${row.effectiveAt.toISOString()}; recorded ${row.createdAt.toISOString()}. ${shown(row.movements.length)} Original evidence; a separate correction requires current ownership and fresh review. Correction of ${row.correctionOfOperationId ?? "none returned"}; linked corrections: ${lineage(row.correctionIds)}. Reason: ${label(row.reason ?? "Not supplied", 120)}. Labels may be shortened.`,
      store,
      asOf,
    ),
  ]
  for (const movement of row.movements.slice(0, MAX_ROWS)) {
    answers.push(
      answer(
        `stock_movement_${movement.id}`,
        `${label(movement.productName)} · ${label(movement.variantName, 60)}`,
        `${quantity(movement.enteredQuantity)} ${label(movement.enteredInventoryUnitName, 60)} entered`,
        `Movement ${movement.id}. Saved source-unit stock before ${quantity(movement.previousOnHandQuantity)}, after ${quantity(movement.resultingOnHandQuantity)}. Signed canonical effect ${quantity(movement.signedCanonicalEffect)}; conversion factor ${quantity(movement.unitFactorSnapshot)}. Custody ${movement.custodyType}${movement.custodyReferenceId ? ` (${movement.custodyReferenceId})` : ""}. Historical movement, not current stock or a financial payment.`,
        store,
        asOf,
      ),
    )
    answers.push(
      answer(
        `stock_movement_evidence_${movement.id}`,
        "Original movement evidence",
        movement.id,
        `Source ${movement.balanceSourceId}; configuration ${movement.configurationVersionId}; entered unit ${movement.enteredInventoryUnitId}; transaction scale ${movement.transactionScaleSnapshot}. Reverses ${movement.reversalOfMovementId ?? "none returned"}; linked reversals ${lineage(movement.reversalIds)}. ${movement.totalCostMinorSnapshot === null ? "No total cost snapshot returned." : `Original total cost snapshot ${movement.totalCostMinorSnapshot} minor units (${movement.currencyCodeSnapshot ?? "currency unavailable"}); not paid money or a new posting.`}`,
        store,
        asOf,
      ),
    )
  }
  return answers
}

export function stockCountReadAnswers(
  row: Count,
  store: string,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const answers = [
    answer(
      `stock_count_${row.id}`,
      "Saved physical stock count",
      row.status,
      `Count ${row.id}. Recorded ${row.createdAt}; finalized ${row.finalizedAt ?? "not finalized"}. ${shown(row.lines.length)} ${row.canFinalize ? "Current draft observations; finalization still requires a separate reviewed proposal." : "Not currently eligible for finalization; status, stock or configuration may have changed."} Original observations are never rebased by reading. Reason: ${label(row.reason ?? "Not supplied", 120)}. Labels may be shortened.`,
      store,
      asOf,
    ),
  ]
  for (const line of row.lines.slice(0, MAX_ROWS)) {
    answers.push(
      answer(
        `stock_count_line_${line.id}`,
        `${label(line.productName)} · ${label(line.variantName, 60)}`,
        `${quantity(line.observedQuantity)} ${label(line.unitName, 60)} observed`,
        `Source ${line.balanceSourceId}. Saved expected ${quantity(line.expectedQuantity)}; signed variance ${quantity(line.varianceQuantity)}. Current source stock ${quantity(line.currentQuantity)}; reserved ${quantity(line.reservedQuantity)}. Custody ${line.custodyType}${line.custodyReferenceId ? ` (${line.custodyReferenceId})` : ""}. Stock ${line.stockCurrent ? "unchanged" : "changed"}; configuration ${line.configurationCurrent ? "current" : "changed"}. ${Math.min(line.entries.length, 3)} of ${line.entries.length} original unit entries shown below. Distinct sources/units are not added.`,
        store,
        asOf,
      ),
    )
    for (const [index, entry] of line.entries.slice(0, 3).entries())
      answers.push(
        answer(
          `stock_count_entry_${line.id}_${index}`,
          "Original counted unit entry",
          `${quantity(entry.enteredQuantity)} ${label(entry.unitName, 60)}`,
          `Count line ${line.id}; entered unit ${entry.enteredInventoryUnitId}. Saved conversion factor ${quantity(entry.factor)} gives canonical quantity ${quantity(entry.canonicalQuantity)}. Original entry, not newly received stock or a financial posting.`,
          store,
          asOf,
        ),
      )
  }
  return answers
}

export function inventoryCloseoutsReadAnswers(
  rows: Closeouts,
  store: string,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  return [
    answer(
      "inventory_closeouts",
      "Recent custody closeouts",
      `${rows.length} returned`,
      `${recent} ${shown(rows.length)} Custody closeouts are separate from financial period close. Read the exact closeout ID for saved declarations and current conflicts.`,
      store,
      asOf,
    ),
    ...rows
      .slice(0, MAX_ROWS)
      .map((row) =>
        answer(
          `inventory_closeout_${row.id}`,
          "Saved custody closeout",
          row.status,
          `Closeout ${row.id}. Custody ${row.custodyType} (${row.custodyReferenceId}); ${row.lineCount} original declarations. Recorded ${row.createdAt}; finalized ${row.finalizedAt ?? "not finalized"}. Reason: ${label(row.reason ?? "Not supplied", 160)}. This identity does not report current stock, financial close or eligibility to finalize.`,
          store,
          asOf,
        ),
      ),
  ]
}

export function inventoryCloseoutReadAnswers(
  row: Closeout,
  store: string,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  return [
    answer(
      `inventory_closeout_${row.id}`,
      "Saved custody closeout",
      row.status,
      `Closeout ${row.id}. Custody ${row.custodyType} (${row.custodyReferenceId}). Recorded ${row.createdAt}; finalized ${row.finalizedAt ?? "not finalized"}. ${shown(row.lines.length)} ${row.canFinalize ? "Current checks pass; finalization requires a separate reviewed proposal." : "Not currently ready to finalize; original declarations stay unchanged."} This is not financial period close. Labels may be shortened.`,
      store,
      asOf,
    ),
    ...row.lines
      .slice(0, MAX_ROWS)
      .map((line) =>
        answer(
          `inventory_closeout_line_${line.id}`,
          `${label(line.productName)} · ${label(line.variantName, 60)}`,
          `${quantity(line.declaredQuantity)} ${label(line.unitName, 60)} declared`,
          `Source ${line.balanceSourceId}. Original expected ${quantity(line.expectedQuantity)}; signed variance ${quantity(line.varianceQuantity)}. Current stock ${quantity(line.currentQuantity)}; reserved ${quantity(line.reservedQuantity)}. Stock ${line.stockCurrent ? "unchanged" : "changed"}; declaration ${line.preservesReservations ? "preserves" : "conflicts with"} current reservations. Saved factor ${quantity(line.unitFactor)}; scale ${line.transactionScale}; configuration ${line.configurationVersionId}. Read-only reconciliation, no rebase or finalization.`,
          store,
          asOf,
        ),
      ),
  ]
}

export function stockTransfersReadAnswers(
  rows: Transfers,
  store: string,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  return [
    answer(
      "stock_transfers",
      "Recent Store transfers",
      `${rows.length} returned`,
      `${recent} ${shown(rows.length)} Only transfers between accessible Stores are shown. Original dispatch is distinct from remaining transit and destination receipt.`,
      store,
      asOf,
    ),
    ...rows
      .slice(0, MAX_ROWS)
      .map((row) =>
        answer(
          `stock_transfer_${row.id}`,
          `${label(row.productName)} · ${label(row.variantName, 60)}`,
          row.status,
          `Transfer ${row.id}. ${label(row.sourceStore.name, 80)} → ${label(row.targetStore.name, 80)}. Recorded ${row.createdAt.toISOString()}. Original dispatch ${quantity(row.quantity)} ${label(row.inventoryUnitName, 60)}; recorded remaining transit ${quantity(row.remainingQuantity)} in that unit. This does not assert destination receipt or a financial payment. Read the exact transfer for acknowledgment history.`,
          store,
          asOf,
        ),
      ),
  ]
}

export function stockTransferReadAnswers(
  row: Transfer,
  store: string,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const answers = [
    answer(
      `stock_transfer_${row.id}`,
      `${label(row.productName)} · ${label(row.variantName, 60)}`,
      row.status,
      `Transfer ${row.id}. ${label(row.sourceStore.name)} → ${label(row.targetStore.name)}. Original dispatch ${quantity(row.dispatchedQuantity)} ${label(row.unitName, 60)} at ${row.createdAt.toISOString()}. Saved conversion factor ${quantity(row.factor)}; scale ${row.transactionScale}; configuration ${row.configurationVersionId}. Destination receipt/cancellation requires separate review; this read has no stock or payment effect. Labels may be shortened.`,
      store,
      asOf,
    ),
    answer(
      `stock_transfer_balances_${row.id}`,
      "Current transfer sources",
      row.transit
        ? `${quantity(row.transit.quantity)} in transit`
        : "No transit source returned",
      `Current source stock ${quantity(row.source.quantity)}; source reserved ${quantity(row.source.reserved)}. ${row.destination ? `Current destination source stock ${quantity(row.destination.quantity)}; reserved ${quantity(row.destination.reserved)}.` : "No current destination stock source returned; missing is not zero."} ${row.transit ? `Transit reserved ${quantity(row.transit.reserved)}.` : "No transit quantity inferred from the missing source."} Quantities use this transfer's saved ${label(row.unitName, 60)} unit; current source balances include other operations and are not original transfer receipts.`,
      store,
      asOf,
    ),
    answer(
      `stock_transfer_history_${row.id}`,
      "Retained transfer acknowledgments",
      `${Math.min(row.acknowledgments.length, MAX_ROWS)} shown`,
      `${row.acknowledgments.length} acknowledgment records returned${row.acknowledgmentHistoryLimited ? "; canonical history is limited, so more original records may exist" : ""}. Only the first ${MAX_ROWS} are displayed here. Read the original in EwaTrade for omitted facts. Receipts and cancellations retain their original kind and remaining-before/after quantities. Do not sum this view into a receipt total.`,
      store,
      asOf,
    ),
  ]
  for (const event of row.acknowledgments.slice(0, MAX_ROWS))
    answers.push(
      answer(
        `stock_transfer_ack_${event.id}`,
        `Transfer acknowledgment · ${event.kind}`,
        `${quantity(event.quantity)} ${label(row.unitName, 60)}`,
        `Acknowledgment ${event.id}; operation ${event.operationId}. Effective ${event.effectiveAt}. Original transit before ${quantity(event.remainingBefore)}, after ${quantity(event.remainingAfter)}. Kind ${event.kind} is retained; cancellation is not destination receipt. Reason: ${label(event.reason ?? "Not supplied", 160)}. No inference of payment or additional movement.`,
        store,
        asOf,
      ),
    )
  return answers
}
