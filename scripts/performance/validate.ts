import { readFileSync } from "node:fs"
import pg from "../../packages/db/node_modules/pg"
import { loadPerformanceDatabaseUrl, performanceTarget } from "./target.mjs"

const contract = JSON.parse(
  readFileSync(new URL("./launch-contract.json", import.meta.url), "utf8"),
)
const tier = contract.fixtureTiers.find(
  (entry: { name: string }) => entry.name === process.argv[2],
)
if (
  !tier ||
  process.argv.length > 4 ||
  (process.argv[3] && process.argv[3] !== "--recovery")
)
  throw new Error(
    "Usage: bun scripts/performance/validate.ts onboarding|ordinary|large-merchant [--recovery]",
  )
const selectedUrl = new URL(loadPerformanceDatabaseUrl())
if (process.argv[3] === "--recovery")
  selectedUrl.pathname = "/ewatrade_performance_recovery_v1"
const pool = new pg.Pool({
  connectionString: selectedUrl.href,
  max: 1,
})
try {
  const client = await pool.connect()
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const {
      rows: [counts],
    } = await client.query(`SELECT
      (SELECT count(*)::int FROM "Tenant") AS tenants,
      (SELECT count(*)::int FROM "Store") AS stores,
      (SELECT count(*)::int FROM "CatalogItem") AS items,
      (SELECT count(*)::int FROM "CommercialOrder") AS orders,
      (SELECT count(*)::int FROM "CommercialOrderLine") AS lines,
      (SELECT count(*)::int FROM "OfferingSnapshot") AS snapshots,
      (SELECT count(*)::int FROM "StockMovement") AS movements,
      (SELECT count(*)::int FROM "StockOperation") AS operations,
      pg_database_size(current_database())::text AS bytes`)
    const expected = {
      tenants: tier.tenants,
      stores: tier.tenants * tier.storesPerTenant,
      items: tier.tenants * tier.catalogItemsPerTenant,
      orders: tier.tenants * tier.ordersPerTenant,
      lines: tier.tenants * tier.ordersPerTenant,
      snapshots: tier.tenants * tier.ordersPerTenant,
      movements: tier.tenants * tier.movementsPerTenant,
      operations: tier.tenants * tier.movementsPerTenant,
    }
    const checks: Record<string, boolean> = Object.fromEntries(
      Object.entries(expected).map(([key, value]) => [
        `count:${key}`,
        counts[key] === value,
      ]),
    )
    const queries = {
      ownership: `SELECT count(*)::int AS failures FROM "Tenant" WHERE "dataClassification" <> 'QA' OR metadata->>'fixtureVersion' <> 'ewatrade-performance-v1' OR id NOT LIKE 'perf-v1-%'`,
      stockProjection: `SELECT count(*)::int AS failures FROM "StockBalanceSource" b LEFT JOIN (SELECT "balanceSourceId", sum("signedCanonicalEffect") AS quantity, count(*)::int AS revision FROM "StockMovement" GROUP BY 1) m ON m."balanceSourceId"=b.id WHERE b."onHandQuantity"<>coalesce(m.quantity,0) OR b.revision<>coalesce(m.revision,0) OR b."reservedQuantity"<>0 OR b."onHandQuantity"<0`,
      movementArithmetic: `SELECT count(*)::int AS failures FROM "StockMovement" WHERE "previousOnHandQuantity"+"signedCanonicalEffect"<>"resultingOnHandQuantity" OR abs("signedCanonicalEffect")<>"enteredQuantity"*"unitFactorSnapshot" OR "enteredQuantity"<=0`,
      movementContinuity: `SELECT count(*)::int AS failures FROM (SELECT "previousOnHandQuantity", lag("resultingOnHandQuantity",1,0) OVER (PARTITION BY "balanceSourceId" ORDER BY "createdAt",id) AS prior FROM "StockMovement") m WHERE "previousOnHandQuantity"<>prior`,
      movementScope: `SELECT count(*)::int AS failures FROM "StockMovement" m JOIN "StockOperation" o ON o.id=m."operationId" JOIN "StockBalanceSource" b ON b.id=m."balanceSourceId" WHERE b."tenantId"<>o."tenantId" OR b."storeId"<>o."storeId"`,
      orderTotals: `SELECT count(*)::int AS failures FROM "CommercialOrder" o LEFT JOIN (SELECT "orderId",sum("totalMinor") AS total FROM "CommercialOrderLine" GROUP BY 1) l ON l."orderId"=o.id WHERE o."totalMinor"<>coalesce(l.total,0)+o."serviceChargeMinor"-o."discountMinor"+o."taxMinor" OR o."amountPaidMinor"<>0`,
      snapshots: `SELECT count(*)::int AS failures FROM "CommercialOrderLine" l LEFT JOIN "OfferingSnapshot" s ON s."orderLineId"=l.id WHERE s.id IS NULL OR s.quantity<>l.quantity OR s."totalMinor"<>l."totalMinor" OR s."offeringId"<>l."offeringId"`,
      orderScope: `SELECT count(*)::int AS failures FROM "CommercialOrderLine" l JOIN "CommercialOrder" o ON o.id=l."orderId" JOIN "SellableOffering" f ON f.id=l."offeringId" JOIN "Store" s ON s.id=o."storeId" WHERE o."tenantId"<>f."tenantId" OR o."tenantId"<>s."tenantId"`,
      productConfiguration: `SELECT count(*)::int AS failures FROM "CatalogProduct" p LEFT JOIN "UnitConfigurationVersion" v ON v.id=p."currentUnitConfigurationVersionId" WHERE v.id IS NULL OR v."productId"<>p.id OR v.status<>'CURRENT'`,
    }
    for (const [name, query] of Object.entries(queries)) {
      const {
        rows: [result],
      } = await client.query(query)
      checks[name] = result.failures === 0
    }
    await client.query("ROLLBACK")
    console.log(
      JSON.stringify(
        {
          version: 1,
          fixtureVersion: performanceTarget.fixtureVersion,
          branch: performanceTarget.neonBranchId,
          tier: tier.name,
          counts,
          checks,
          passed: Object.values(checks).every(Boolean),
        },
        null,
        2,
      ),
    )
    if (!Object.values(checks).every(Boolean)) process.exitCode = 1
  } finally {
    client.release()
  }
} catch {
  console.error(
    "Fixture validation failed; no provider errors or credentials emitted.",
  )
  process.exitCode = 1
} finally {
  await pool.end()
}
