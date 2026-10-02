import { Prisma } from "../../../generated/prisma/client"
import { FinanceError, financePayloadHash } from "./rules"

export type ReviewedReturnFence = Array<{
  kind: string
  id: string
  facts: string
}>

/** Exact database row text preserves BIGINT/decimal precision; no JSON number parsing. */
export async function readReviewedCostReturnFence(
  tx: Prisma.TransactionClient,
  orderLineIds: string[],
): Promise<ReviewedReturnFence> {
  if (
    orderLineIds.length > 128 ||
    new Set(orderLineIds).size !== orderLineIds.length
  )
    throw new FinanceError(
      "CONFLICT",
      "Original return coordination requires complete unique Order Lines.",
    )
  if (!orderLineIds.length) return []
  return tx.$queryRaw<ReviewedReturnFence>`
    WITH lines AS (
      SELECT * FROM "CommercialOrderLine" WHERE id IN (${Prisma.join(orderLineIds)}) ORDER BY id LIMIT 129
    ), orders AS (
      SELECT o.* FROM "CommercialOrder" o WHERE o.id IN (SELECT "orderId" FROM lines)
    ), snapshots AS (
      SELECT s.* FROM "OfferingSnapshot" s WHERE s."orderLineId" IN (SELECT id FROM lines)
    ), fulfillments AS (
      SELECT f.* FROM "ProductFulfillment" f WHERE f."orderLineId" IN (SELECT id FROM lines) ORDER BY id LIMIT 4097
    ), returns AS (
      SELECT r.* FROM "ProductReturn" r WHERE r."orderLineId" IN (SELECT id FROM lines) ORDER BY id LIMIT 4097
    ), headers AS (
      SELECT h.* FROM "FinanceProductReturnCost" h
      WHERE h."orderLineId" IN (SELECT id FROM lines) OR h."productReturnId" IN (SELECT id FROM returns)
      ORDER BY id LIMIT 4097
    ), allocations AS (
      SELECT a.* FROM "FinanceProductReturnCostAllocation" a
      WHERE a."orderLineId" IN (SELECT id FROM lines) OR a."returnCostId" IN (SELECT id FROM headers)
        OR a."fulfillmentId" IN (SELECT id FROM fulfillments)
      ORDER BY id LIMIT 4097
    ), reservations AS (
      SELECT r.* FROM "StockReservation" r WHERE r.id IN (SELECT "reservationId" FROM fulfillments)
    ), operations AS (
      SELECT op.* FROM "StockOperation" op WHERE op.id IN (
        SELECT "stockOperationId" FROM fulfillments UNION SELECT "stockOperationId" FROM returns
      ) ORDER BY id LIMIT 4097
    ), movements AS (
      SELECT m.* FROM "StockMovement" m WHERE m."operationId" IN (SELECT id FROM operations) ORDER BY id LIMIT 4097
    ), events AS (
      SELECT e.* FROM "FinanceInventoryValuationEvent" e
      WHERE e."stockOperationId" IN (SELECT id FROM operations) OR e."productReturnCostId" IN (SELECT id FROM headers)
        OR e.id IN (SELECT "originalIssueId" FROM allocations)
      ORDER BY id LIMIT 4097
    ), balances AS (
      SELECT b.* FROM "StockBalanceSource" b WHERE b.id IN (SELECT "balanceSourceId" FROM movements) ORDER BY id LIMIT 129
    ), stores AS (
      SELECT s.* FROM "Store" s WHERE s.id IN (
        SELECT "storeId" FROM orders UNION SELECT "storeId" FROM operations UNION SELECT "storeId" FROM balances
      )
    ), facts AS (
      SELECT 'line' AS kind, id, to_jsonb(l)::text AS facts FROM lines l
      UNION ALL SELECT 'order', id, to_jsonb(o)::text FROM orders o
      UNION ALL SELECT 'snapshot', id, to_jsonb(s)::text FROM snapshots s
      UNION ALL SELECT 'fulfillment', id, to_jsonb(f)::text FROM fulfillments f
      UNION ALL SELECT 'return', id, to_jsonb(r)::text FROM returns r
      UNION ALL SELECT 'header', id, to_jsonb(h)::text FROM headers h
      UNION ALL SELECT 'allocation', id, to_jsonb(a)::text FROM allocations a
      UNION ALL SELECT 'reservation', id, to_jsonb(r)::text FROM reservations r
      UNION ALL SELECT 'operation', id, to_jsonb(op)::text FROM operations op
      UNION ALL SELECT 'movement', id, to_jsonb(m)::text FROM movements m
      UNION ALL SELECT 'event', id, to_jsonb(e)::text FROM events e
      UNION ALL SELECT 'balance', id, to_jsonb(b)::text FROM balances b
      UNION ALL SELECT 'store', id, to_jsonb(s)::text FROM stores s
    ) SELECT kind, id, facts FROM facts ORDER BY kind, id
  `
}

/** Full original rows were proved under owning Order locks; do not append new locks. */
export function assertReviewedCostReturnFenceUnchanged(
  before: ReviewedReturnFence,
  after: ReviewedReturnFence,
) {
  if (financePayloadHash(before) !== financePayloadHash(after))
    throw new FinanceError(
      "CONFLICT",
      "Original Product return facts changed; retry the whole snapshot.",
    )
}
