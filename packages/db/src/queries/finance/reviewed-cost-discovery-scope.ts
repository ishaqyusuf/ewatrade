import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"

type Reference = { kind: string; id: string }
type ScopeRow = Reference & { valid: boolean }
const kinds = new Set([
  "BALANCE",
  "OPERATION",
  "TRANSFER",
  "ORDER_LINE",
  "RETURN",
  "REVIEW_ALLOCATION",
  "COUNT",
  "COUNT_LINE",
  "CLOSEOUT",
  "CLOSEOUT_LINE",
])
const key = (row: Reference) => JSON.stringify([row.kind, row.id])
function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Connected sources are missing, crossed or use an unsupported currency.",
  )
}
function expectedReferences(references: Reference[]) {
  if (references.length > 32768) conflict()
  const scoped = references.filter((row) => row.kind !== "MOVEMENT")
  if (
    scoped.some((row) => !kinds.has(row.kind) || !row.id.trim()) ||
    new Set(scoped.map(key)).size !== scoped.length
  )
    conflict()
  return scoped
}

export function assertReviewedCostDiscoveryScopeRows(
  references: Reference[],
  rows: ScopeRow[],
) {
  const expected = new Set(expectedReferences(references).map(key))
  if (
    rows.length !== expected.size ||
    new Set(rows.map(key)).size !== rows.length ||
    rows.some((row) => row.valid !== true || !expected.has(key(row)))
  )
    conflict()
}

/** One complete identity read with left joins; foreign/missing owners never disappear. */
export async function readReviewedCostDiscoveryScopeInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    bookId: string
    currencyCode: string
    references: Reference[]
  },
) {
  const references = expectedReferences(input.references)
  if (!references.length) return
  const rows = await tx.$queryRaw<ScopeRow[]>`
    WITH requested AS (
      SELECT kind, id FROM jsonb_to_recordset(${JSON.stringify(references)}::jsonb)
        AS identities(kind text, id text)
    )
    SELECT req.kind, req.id, COALESCE(CASE req.kind
      WHEN 'BALANCE' THEN b.id IS NOT NULL
        AND b."tenantId" = ${input.tenantId}
        AND bs."tenantId" = ${input.tenantId} AND bs."currencyCode" = ${input.currencyCode}
      WHEN 'OPERATION' THEN op.id IS NOT NULL
        AND op."tenantId" = ${input.tenantId}
        AND os."tenantId" = ${input.tenantId} AND os."currencyCode" = ${input.currencyCode}
      WHEN 'TRANSFER' THEN t.id IS NOT NULL
        AND t."tenantId" = ${input.tenantId}
        AND ts."tenantId" = ${input.tenantId} AND ts."currencyCode" = ${input.currencyCode}
        AND tt."tenantId" = ${input.tenantId} AND tt."currencyCode" = ${input.currencyCode}
      WHEN 'ORDER_LINE' THEN l.id IS NOT NULL AND l.kind = 'PRODUCT_UNIT'
        AND lo."tenantId" = ${input.tenantId} AND lo."currencyCode" = ${input.currencyCode}
        AND ls."tenantId" = ${input.tenantId} AND ls."currencyCode" = ${input.currencyCode}
      WHEN 'RETURN' THEN r.id IS NOT NULL
        AND r."tenantId" = ${input.tenantId}
        AND rs."tenantId" = ${input.tenantId} AND rs."currencyCode" = ${input.currencyCode}
        AND ro."tenantId" = ${input.tenantId} AND ro."currencyCode" = ${input.currencyCode}
        AND r."orderId" = rl."orderId"
      WHEN 'COUNT' THEN c.id IS NOT NULL AND c."tenantId" = ${input.tenantId}
        AND cs."tenantId" = ${input.tenantId} AND cs."currencyCode" = ${input.currencyCode}
      WHEN 'CLOSEOUT' THEN co.id IS NOT NULL AND co."tenantId" = ${input.tenantId}
        AND cos."tenantId" = ${input.tenantId} AND cos."currencyCode" = ${input.currencyCode}
      WHEN 'CLOSEOUT_LINE' THEN col.id IS NOT NULL AND colc."tenantId" = ${input.tenantId}
        AND colb."tenantId" = ${input.tenantId} AND colb."storeId" = colc."storeId"
        AND colbs."tenantId" = ${input.tenantId} AND colbs."currencyCode" = ${input.currencyCode}
        AND colb."custodyType" = colc."custodyType"
        AND colb."custodyReferenceId" = colc."custodyReferenceId"
        AND colp."tenantId" = ${input.tenantId} AND colp."storeId" = colc."storeId"
        AND colp."custodyType" = 'STORE' AND colp."custodyReferenceId" = ''
        AND colp."parentBalanceSourceId" IS NULL
        AND colp."productId" = colb."productId"
        AND colp."variantId" = colb."variantId"
        AND colp."inventoryUnitId" = colb."inventoryUnitId"
        AND colp.kind = colb.kind
        AND colci."tenantId" = ${input.tenantId}
        AND colv."catalogItemId" = colpr."catalogItemId"
        AND coluc."productId" = colb."productId"
        AND CASE WHEN colb.kind = 'SHARED_POOL' THEN
          colu."stockBehavior" = 'CANONICAL_SHARED' AND colu.factor = 1
          WHEN colb.kind = 'PACKAGED_STOCK' THEN colu."stockBehavior" = 'PACKAGED_STOCK'
          ELSE FALSE END
      WHEN 'COUNT_LINE' THEN cl.id IS NOT NULL AND lc."tenantId" = ${input.tenantId}
        AND lb."tenantId" = ${input.tenantId} AND lb."storeId" = lc."storeId"
        AND lbs."tenantId" = ${input.tenantId} AND lbs."currencyCode" = ${input.currencyCode}
        AND lci."tenantId" = ${input.tenantId}
        AND lcv."catalogItemId" = lcp."catalogItemId"
        AND lcu."configurationVersionId" = cl."configurationVersionId"
        AND lcuc."productId" = lb."productId"
        AND lcou."configurationVersionId" = lcu."configurationVersionId"
        AND CASE WHEN lb.kind = 'SHARED_POOL' THEN
          lcu."stockBehavior" = 'CANONICAL_SHARED' AND lcu.factor = 1
          AND lcou."stockBehavior" IN ('CANONICAL_SHARED', 'ALTERNATE_TRANSACTION')
          WHEN lb.kind = 'PACKAGED_STOCK' THEN lcu."stockBehavior" = 'PACKAGED_STOCK'
            AND lcou.id = lcu.id
          ELSE FALSE END
      WHEN 'REVIEW_ALLOCATION' THEN a.id IS NOT NULL
        AND a."tenantId" = ${input.tenantId} AND a."bookId" = ${input.bookId}
      ELSE FALSE END, FALSE) AS valid
    FROM requested req
    LEFT JOIN "StockBalanceSource" b ON req.kind = 'BALANCE' AND b.id = req.id
    LEFT JOIN "Store" bs ON bs.id = b."storeId"
    LEFT JOIN "StockOperation" op ON req.kind = 'OPERATION' AND op.id = req.id
    LEFT JOIN "Store" os ON os.id = op."storeId"
    LEFT JOIN "StockTransfer" t ON req.kind = 'TRANSFER' AND t.id = req.id
    LEFT JOIN "Store" ts ON ts.id = t."sourceStoreId"
    LEFT JOIN "Store" tt ON tt.id = t."targetStoreId"
    LEFT JOIN "CommercialOrderLine" l ON req.kind = 'ORDER_LINE' AND l.id = req.id
    LEFT JOIN "CommercialOrder" lo ON lo.id = l."orderId"
    LEFT JOIN "Store" ls ON ls.id = lo."storeId"
    LEFT JOIN "ProductReturn" r ON req.kind = 'RETURN' AND r.id = req.id
    LEFT JOIN "Store" rs ON rs.id = r."storeId"
    LEFT JOIN "CommercialOrder" ro ON ro.id = r."orderId"
    LEFT JOIN "CommercialOrderLine" rl ON rl.id = r."orderLineId"
    LEFT JOIN "StockCount" c ON req.kind = 'COUNT' AND c.id = req.id
    LEFT JOIN "Store" cs ON cs.id = c."storeId"
    LEFT JOIN "StockCountLine" cl ON req.kind = 'COUNT_LINE' AND cl.id = req.id
    LEFT JOIN "StockCount" lc ON lc.id = cl."stockCountId"
    LEFT JOIN "StockBalanceSource" lb ON lb.id = cl."balanceSourceId"
    LEFT JOIN "Store" lbs ON lbs.id = lb."storeId"
    LEFT JOIN "CatalogProduct" lcp ON lcp.id = lb."productId"
    LEFT JOIN "CatalogItem" lci ON lci.id = lcp."catalogItemId"
    LEFT JOIN "SellableVariant" lcv ON lcv.id = lb."variantId"
    LEFT JOIN "InventoryUnit" lcu ON lcu.id = lb."inventoryUnitId"
    LEFT JOIN "UnitConfigurationVersion" lcuc ON lcuc.id = lcu."configurationVersionId"
    LEFT JOIN "InventoryUnit" lcou ON lcou.id = cl."observedInventoryUnitId"
    LEFT JOIN "InventoryCloseout" co ON req.kind = 'CLOSEOUT' AND co.id = req.id
    LEFT JOIN "Store" cos ON cos.id = co."storeId"
    LEFT JOIN "InventoryCloseoutLine" col ON req.kind = 'CLOSEOUT_LINE' AND col.id = req.id
    LEFT JOIN "InventoryCloseout" colc ON colc.id = col."closeoutId"
    LEFT JOIN "StockBalanceSource" colb ON colb.id = col."balanceSourceId"
    LEFT JOIN "Store" colbs ON colbs.id = colb."storeId"
    LEFT JOIN "StockBalanceSource" colp ON colp.id = colb."parentBalanceSourceId"
    LEFT JOIN "CatalogProduct" colpr ON colpr.id = colb."productId"
    LEFT JOIN "CatalogItem" colci ON colci.id = colpr."catalogItemId"
    LEFT JOIN "SellableVariant" colv ON colv.id = colb."variantId"
    LEFT JOIN "InventoryUnit" colu ON colu.id = colb."inventoryUnitId"
    LEFT JOIN "UnitConfigurationVersion" coluc ON coluc.id = colu."configurationVersionId"
    LEFT JOIN "FinanceInventoryCostReviewAllocation" a ON req.kind = 'REVIEW_ALLOCATION' AND a.id = req.id
  `
  assertReviewedCostDiscoveryScopeRows(input.references, rows)
}
