import { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import {
  type ReviewedCostBookContext,
  readReviewedCostBook,
} from "./reviewed-cost-book-context"
import { readReviewedCostDiscoveryScopeInTransaction } from "./reviewed-cost-discovery-scope"
import { FinanceError, financePayloadHash } from "./rules"

const MAX_REFERENCES = 32768
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

/**
 * Discover persisted connected source identities before any stock lock is taken.
 * Ownership is checked, but source semantics, exact return budgets, monetary
 * evidence, prior journals and confirmation authority still require proof.
 */
export async function discoverReviewedCostSourcesInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string; balanceSourceIds: string[] },
  context?: ReviewedCostBookContext,
) {
  const roots = [...input.balanceSourceIds].sort()
  if (
    !roots.length ||
    roots.length > 128 ||
    new Set(roots).size !== roots.length ||
    roots.some((id) => !id.trim() || id.length > 256)
  )
    conflict("Cost discovery requires 1–128 unique original balances.")
  const book = await readReviewedCostBook(tx, input, context)
  const rootRows = await tx.stockBalanceSource.findMany({
    where: { id: { in: roots }, tenantId: input.tenantId },
    select: { id: true },
    take: 129,
  })
  if (rootRows.length !== roots.length)
    conflict("Original balances do not all belong to this Tenant.")

  // UNION deduplicates (kind,id), including cycles. Do not add depth/timestamp
  // to that identity or date/Tenant filters that silently hide crossed history.
  // LIMIT is an overflow sentinel, never permission to use a truncated graph.
  const references = await tx.$queryRaw<Array<{ kind: string; id: string }>>`
    WITH RECURSIVE graph(kind, id) AS (
      SELECT 'BALANCE'::text, b.id FROM "StockBalanceSource" b
      WHERE b.id IN (${Prisma.join(roots)})
      UNION
      SELECT next.kind, next.id FROM graph g CROSS JOIN LATERAL (
        SELECT 'MOVEMENT'::text AS kind, m.id FROM "StockMovement" m
          WHERE g.kind = 'BALANCE' AND m."balanceSourceId" = g.id
        UNION ALL
        SELECT 'BALANCE', b."parentBalanceSourceId" FROM "StockBalanceSource" b
          WHERE g.kind = 'BALANCE' AND b.id = g.id AND b."parentBalanceSourceId" IS NOT NULL
        UNION ALL
        SELECT 'BALANCE', b.id FROM "StockBalanceSource" b
          WHERE g.kind = 'BALANCE' AND b."parentBalanceSourceId" = g.id
        UNION ALL
        SELECT 'BALANCE', m."balanceSourceId" FROM "StockMovement" m
          WHERE g.kind = 'MOVEMENT' AND m.id = g.id
        UNION ALL
        SELECT 'OPERATION', m."operationId" FROM "StockMovement" m
          WHERE g.kind = 'MOVEMENT' AND m.id = g.id
        UNION ALL
        SELECT 'MOVEMENT', m."reversalOfMovementId" FROM "StockMovement" m
          WHERE g.kind = 'MOVEMENT' AND m.id = g.id AND m."reversalOfMovementId" IS NOT NULL
        UNION ALL
        SELECT 'MOVEMENT', m.id FROM "StockMovement" m
          WHERE (g.kind = 'MOVEMENT' AND m."reversalOfMovementId" = g.id)
             OR (g.kind = 'OPERATION' AND m."operationId" = g.id)
        UNION ALL
        SELECT 'OPERATION', o."linkedOperationId" FROM "StockOperation" o
          WHERE g.kind = 'OPERATION' AND o.id = g.id AND o."linkedOperationId" IS NOT NULL
        UNION ALL
        SELECT 'OPERATION', o."correctionOfOperationId" FROM "StockOperation" o
          WHERE g.kind = 'OPERATION' AND o.id = g.id AND o."correctionOfOperationId" IS NOT NULL
        UNION ALL
        SELECT 'OPERATION', o.id FROM "StockOperation" o
          WHERE g.kind = 'OPERATION' AND (o."linkedOperationId" = g.id OR o."correctionOfOperationId" = g.id)
        UNION ALL
        SELECT 'TRANSFER', t.id FROM "StockTransfer" t
          WHERE (g.kind = 'BALANCE' AND (t."sourceBalanceSourceId" = g.id OR t."transitBalanceSourceId" = g.id)
            AND (t."transitBalanceSourceId" IS NOT NULL OR t."dispatchedOperationId" IS NOT NULL OR t."receivedOperationId" IS NOT NULL OR t."cancelledOperationId" IS NOT NULL))
             OR (g.kind = 'OPERATION' AND (t."dispatchedOperationId" = g.id OR t."receivedOperationId" = g.id OR t."cancelledOperationId" = g.id))
        UNION ALL
        SELECT 'BALANCE', t."sourceBalanceSourceId" FROM "StockTransfer" t WHERE g.kind = 'TRANSFER' AND t.id = g.id
        UNION ALL
        SELECT 'BALANCE', t."transitBalanceSourceId" FROM "StockTransfer" t
          WHERE g.kind = 'TRANSFER' AND t.id = g.id AND t."transitBalanceSourceId" IS NOT NULL
        UNION ALL
        SELECT 'OPERATION', stage.id FROM "StockTransfer" t
          CROSS JOIN LATERAL (VALUES (t."dispatchedOperationId"), (t."receivedOperationId"), (t."cancelledOperationId")) stage(id)
          WHERE g.kind = 'TRANSFER' AND t.id = g.id AND stage.id IS NOT NULL
        UNION ALL
        SELECT 'COUNT', c.id FROM "StockCount" c
          WHERE g.kind = 'OPERATION' AND c."finalizedOperationId" = g.id
        UNION ALL
        SELECT 'OPERATION', c."finalizedOperationId" FROM "StockCount" c
          WHERE g.kind = 'COUNT' AND c.id = g.id AND c."finalizedOperationId" IS NOT NULL
        UNION ALL
        SELECT 'COUNT_LINE', l.id FROM "StockCountLine" l
          WHERE g.kind = 'COUNT' AND l."stockCountId" = g.id
        UNION ALL
        SELECT 'COUNT', l."stockCountId" FROM "StockCountLine" l
          WHERE g.kind = 'COUNT_LINE' AND l.id = g.id
        UNION ALL
        SELECT 'CLOSEOUT', c.id FROM "InventoryCloseout" c
          WHERE g.kind = 'OPERATION' AND c."finalizedOperationId" = g.id
        UNION ALL
        SELECT 'OPERATION', c."finalizedOperationId" FROM "InventoryCloseout" c
          WHERE g.kind = 'CLOSEOUT' AND c.id = g.id AND c."finalizedOperationId" IS NOT NULL
        UNION ALL
        SELECT 'CLOSEOUT_LINE', l.id FROM "InventoryCloseoutLine" l
          WHERE g.kind = 'CLOSEOUT' AND l."closeoutId" = g.id
        UNION ALL
        SELECT 'CLOSEOUT', l."closeoutId" FROM "InventoryCloseoutLine" l
          WHERE g.kind = 'CLOSEOUT_LINE' AND l.id = g.id
        UNION ALL
        SELECT 'CLOSEOUT', l."closeoutId" FROM "InventoryCloseoutLine" l
          JOIN "InventoryCloseout" c ON c.id = l."closeoutId"
          WHERE g.kind = 'BALANCE' AND l."balanceSourceId" = g.id
            AND c."finalizedOperationId" IS NOT NULL
        UNION ALL
        SELECT 'ORDER_LINE', f."orderLineId" FROM "ProductFulfillment" f
          WHERE g.kind = 'OPERATION' AND f."stockOperationId" = g.id
        UNION ALL
        SELECT 'OPERATION', f."stockOperationId" FROM "ProductFulfillment" f
          WHERE g.kind = 'ORDER_LINE' AND f."orderLineId" = g.id
        UNION ALL
        SELECT 'BALANCE', s."balanceSourceId" FROM "StockReservation" s
          WHERE g.kind = 'ORDER_LINE' AND s."commercialOrderLineId" = g.id
        UNION ALL
        SELECT 'OPERATION', s."committedOperationId" FROM "StockReservation" s
          WHERE g.kind = 'ORDER_LINE' AND s."commercialOrderLineId" = g.id AND s."committedOperationId" IS NOT NULL
        UNION ALL
        SELECT 'BALANCE', s."balanceSourceId" FROM "OfferingSnapshot" s
          WHERE g.kind = 'ORDER_LINE' AND s."orderLineId" = g.id AND s."balanceSourceId" IS NOT NULL
        UNION ALL
        SELECT 'RETURN', r.id FROM "ProductReturn" r
          WHERE (g.kind = 'BALANCE' AND r."destinationBalanceSourceId" = g.id)
             OR (g.kind = 'OPERATION' AND r."stockOperationId" = g.id)
             OR (g.kind = 'ORDER_LINE' AND r."orderLineId" = g.id)
        UNION ALL
        SELECT 'ORDER_LINE', r."orderLineId" FROM "ProductReturn" r WHERE g.kind = 'RETURN' AND r.id = g.id
        UNION ALL
        SELECT 'BALANCE', r."destinationBalanceSourceId" FROM "ProductReturn" r
          WHERE g.kind = 'RETURN' AND r.id = g.id AND r."destinationBalanceSourceId" IS NOT NULL
        UNION ALL
        SELECT 'OPERATION', r."stockOperationId" FROM "ProductReturn" r
          WHERE g.kind = 'RETURN' AND r.id = g.id AND r."stockOperationId" IS NOT NULL
        UNION ALL
        SELECT 'MOVEMENT', e."stockMovementId" FROM "FinanceProductReturnCost" c
          JOIN "FinanceProductReturnCostAllocation" a ON a."returnCostId" = c.id
          JOIN "FinanceInventoryValuationEvent" e ON e.id = a."originalIssueId"
          WHERE g.kind = 'RETURN' AND c."productReturnId" = g.id
        UNION ALL
        SELECT 'RETURN', c."productReturnId" FROM "FinanceInventoryValuationEvent" e
          JOIN "FinanceProductReturnCostAllocation" a ON a."originalIssueId" = e.id
          JOIN "FinanceProductReturnCost" c ON c.id = a."returnCostId"
          WHERE g.kind = 'MOVEMENT' AND e."stockMovementId" = g.id
        UNION ALL
        SELECT 'OPERATION', f."stockOperationId" FROM "FinanceProductReturnCost" c
          JOIN "FinanceProductReturnCostAllocation" a ON a."returnCostId" = c.id
          JOIN "ProductFulfillment" f ON f.id = a."fulfillmentId"
          WHERE g.kind = 'RETURN' AND c."productReturnId" = g.id
        UNION ALL
        SELECT 'REVIEW_ALLOCATION', a.id FROM "FinanceInventoryCostReviewAllocation" a
          WHERE g.kind = 'BALANCE' AND a."balanceSourceId" = g.id AND a."bookId" = ${book.id}
        UNION ALL
        SELECT 'REVIEW_ALLOCATION', a.id FROM "FinanceInventoryPool" p
          JOIN "FinanceInventoryCostReviewPool" snapshot ON snapshot.id = p."lastCostReviewSnapshotId"
          JOIN "FinanceInventoryCostReviewAllocation" a ON a."reviewId" = snapshot."reviewId" AND a."bookId" = snapshot."bookId"
          WHERE g.kind = 'BALANCE' AND p."balanceSourceId" = g.id AND p."bookId" = ${book.id}
        UNION ALL
        SELECT 'REVIEW_POOL', p."lastCostReviewSnapshotId" FROM "FinanceInventoryPool" p
          WHERE g.kind = 'BALANCE' AND p."balanceSourceId" = g.id
            AND p."bookId" = ${book.id} AND p."lastCostReviewSnapshotId" IS NOT NULL
        UNION ALL
        SELECT 'REVIEW_HEADER', a."reviewId" FROM "FinanceInventoryCostReviewAllocation" a
          WHERE g.kind = 'REVIEW_ALLOCATION' AND a.id = g.id
        UNION ALL
        SELECT 'REVIEW_HEADER', p."reviewId" FROM "FinanceInventoryCostReviewPool" p
          WHERE g.kind = 'REVIEW_POOL' AND p.id = g.id
        UNION ALL
        SELECT 'REVIEW_POOL', p.id FROM "FinanceInventoryCostReviewPool" p
          WHERE g.kind = 'REVIEW_HEADER' AND p."reviewId" = g.id
        UNION ALL
        SELECT 'REVIEW_ALLOCATION', a.id FROM "FinanceInventoryCostReviewAllocation" a
          WHERE g.kind = 'REVIEW_HEADER' AND a."reviewId" = g.id
        UNION ALL
        SELECT 'BALANCE', p."balanceSourceId" FROM "FinanceInventoryCostReviewPool" p
          WHERE g.kind = 'REVIEW_POOL' AND p.id = g.id
        UNION ALL
        SELECT 'REVIEW_ALLOCATION', sibling.id FROM "FinanceInventoryCostReviewAllocation" a
          JOIN "FinanceInventoryCostReviewAllocation" sibling ON sibling."bookId" = a."bookId" AND sibling."reviewId" = a."reviewId"
          WHERE g.kind = 'REVIEW_ALLOCATION' AND a.id = g.id
        UNION ALL
        SELECT 'BALANCE', snapshot."balanceSourceId" FROM "FinanceInventoryCostReviewAllocation" a
          JOIN "FinanceInventoryCostReviewPool" snapshot ON snapshot."reviewId" = a."reviewId" AND snapshot."bookId" = a."bookId"
          WHERE g.kind = 'REVIEW_ALLOCATION' AND a.id = g.id
        UNION ALL
        SELECT 'BALANCE', a."balanceSourceId" FROM "FinanceInventoryCostReviewAllocation" a
          WHERE g.kind = 'REVIEW_ALLOCATION' AND a.id = g.id
        UNION ALL
        SELECT 'MOVEMENT', a."stockMovementId" FROM "FinanceInventoryCostReviewAllocation" a
          WHERE g.kind = 'REVIEW_ALLOCATION' AND a.id = g.id AND a."stockMovementId" IS NOT NULL
        UNION ALL
        SELECT 'RETURN', c."productReturnId" FROM "FinanceInventoryCostReviewAllocation" a
          JOIN "FinanceProductReturnCostAllocation" r ON r.id = a."productReturnAllocationId"
          JOIN "FinanceProductReturnCost" c ON c.id = r."returnCostId"
          WHERE g.kind = 'REVIEW_ALLOCATION' AND a.id = g.id
        UNION ALL
        SELECT 'REVIEW_ALLOCATION', a."previousResolutionId" FROM "FinanceInventoryCostReviewAllocation" a
          WHERE g.kind = 'REVIEW_ALLOCATION' AND a.id = g.id AND a."previousResolutionId" IS NOT NULL
        UNION ALL
        SELECT 'REVIEW_ALLOCATION', a.id FROM "FinanceInventoryCostReviewAllocation" a
          WHERE g.kind = 'REVIEW_ALLOCATION' AND a."previousResolutionId" = g.id
        UNION ALL
        SELECT 'REVIEW_ALLOCATION', original.id FROM "FinanceInventoryCostReviewAllocation" a
          JOIN "FinanceInventoryCostReviewAllocation" original
            ON original."bookId" = a."bookId" AND original."reviewId" = a."reviewId" AND original."sourceKey" = a."originalSourceKey"
          WHERE g.kind = 'REVIEW_ALLOCATION' AND a.id = g.id
        UNION ALL
        SELECT 'REVIEW_ALLOCATION', dependent.id FROM "FinanceInventoryCostReviewAllocation" original
          JOIN "FinanceInventoryCostReviewAllocation" dependent
            ON dependent."bookId" = original."bookId" AND dependent."reviewId" = original."reviewId" AND dependent."originalSourceKey" = original."sourceKey"
          WHERE g.kind = 'REVIEW_ALLOCATION' AND original.id = g.id
      ) next
    ) SELECT kind, id FROM graph LIMIT ${MAX_REFERENCES + 1}
  `
  if (references.length > MAX_REFERENCES)
    conflict(
      "Connected source history exceeds bounded discovery; staging is required.",
    )
  const ids = (kind: string) =>
    references
      .filter((row) => row.kind === kind)
      .map((row) => row.id)
      .sort()
  const balanceSourceIds = ids("BALANCE")
  const movementIds = ids("MOVEMENT")
  const operationIds = ids("OPERATION")
  const transferIds = ids("TRANSFER")
  const orderLineIds = ids("ORDER_LINE")
  const productReturnIds = ids("RETURN")
  const reviewAllocationIds = ids("REVIEW_ALLOCATION")
  const priorReviewIds = ids("REVIEW_HEADER")
  const priorReviewPoolSnapshotIds = ids("REVIEW_POOL")
  if (
    priorReviewIds.length > 4096 ||
    priorReviewPoolSnapshotIds.length > 4096 ||
    reviewAllocationIds.length > 4096 ||
    balanceSourceIds.length > 128 ||
    movementIds.length > 4096 ||
    productReturnIds.length > 4096
  )
    conflict(
      "Connected cost history exceeds complete pool/movement/return bounds.",
    )
  await readReviewedCostDiscoveryScopeInTransaction(tx, {
    tenantId: input.tenantId,
    bookId: book.id,
    currencyCode: book.currencyCode,
    references: references.filter(
      (row) => row.kind !== "REVIEW_HEADER" && row.kind !== "REVIEW_POOL",
    ),
  })
  const priorReferences = references.filter(
    (row) => row.kind === "REVIEW_HEADER" || row.kind === "REVIEW_POOL",
  )
  if (priorReferences.length) {
    const scoped = await tx.$queryRaw<
      Array<{ kind: string; id: string; valid: boolean }>
    >`
      WITH requested AS (
        SELECT kind, id FROM jsonb_to_recordset(${JSON.stringify(priorReferences)}::jsonb)
          AS identities(kind text, id text)
      )
      SELECT req.kind, req.id, COALESCE(CASE req.kind
        WHEN 'REVIEW_HEADER' THEN r.id IS NOT NULL AND r."tenantId" = ${input.tenantId} AND r."bookId" = ${book.id}
        WHEN 'REVIEW_POOL' THEN p.id IS NOT NULL AND p."tenantId" = ${input.tenantId} AND p."bookId" = ${book.id}
        ELSE FALSE END, FALSE) AS valid
      FROM requested req
      LEFT JOIN "FinanceInventoryCostReview" r ON req.kind = 'REVIEW_HEADER' AND r.id = req.id
      LEFT JOIN "FinanceInventoryCostReviewPool" p ON req.kind = 'REVIEW_POOL' AND p.id = req.id
    `
    const keys = new Set(
      priorReferences.map((row) => JSON.stringify([row.kind, row.id])),
    )
    if (
      scoped.length !== keys.size ||
      new Set(scoped.map((row) => JSON.stringify([row.kind, row.id]))).size !==
        scoped.length ||
      scoped.some(
        (row) => !row.valid || !keys.has(JSON.stringify([row.kind, row.id])),
      )
    )
      conflict(
        "Prior review headers/pools are missing or cross Tenant/Book scope.",
      )
  }
  const priorScope: {
    priorReviewIds?: string[]
    priorReviewPoolSnapshotIds?: string[]
  } = {}
  // Preserve the no-prior discovery shape and its original hash.
  if (priorReferences.length) {
    priorScope.priorReviewIds = priorReviewIds
    priorScope.priorReviewPoolSnapshotIds = priorReviewPoolSnapshotIds
  }
  const sourceDocumentReferences: {
    sourceDocumentReferences?: Array<{ kind: string; id: string }>
  } = {}
  const documents = references
    .filter((row) =>
      ["COUNT", "COUNT_LINE", "CLOSEOUT", "CLOSEOUT_LINE"].includes(row.kind),
    )
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
  if (documents.length)
    sourceDocumentReferences.sourceDocumentReferences = documents
  const discovered = {
    tenantId: input.tenantId,
    bookId: book.id,
    currencyCode: book.currencyCode,
    bookSequence: book.lastSequence,
    rootBalanceSourceIds: roots,
    balanceSourceIds,
    movementIds,
    operationIds,
    transferIds,
    orderLineIds,
    productReturnIds,
    reviewAllocationIds,
    ...priorScope,
    ...sourceDocumentReferences,
  }
  return {
    ...discovered,
    sourceDiscoveryHash: financePayloadHash(discovered),
    requiresOwningSourceProof: true as const,
    requiresMonetaryProof: true as const,
  }
}
