import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import {
  type Prisma,
  PrismaClient,
} from "../../packages/db/generated/prisma/client"
import { PrismaPg } from "../../packages/db/node_modules/@prisma/adapter-pg"
import { loadPerformanceDatabaseUrl, performanceTarget } from "./target.mjs"

const contract = JSON.parse(
  readFileSync(new URL("./launch-contract.json", import.meta.url), "utf8"),
)
type Tier = {
  name: string
  tenants: number
  storesPerTenant: number
  catalogItemsPerTenant: number
  ordersPerTenant: number
  movementsPerTenant: number
}
const tier: Tier | undefined = contract.fixtureTiers.find(
  (entry: Tier) => entry.name === process.argv[2],
)
if (!tier || process.argv.length !== 3)
  throw new Error(
    "Usage: bun scripts/performance/seed.ts onboarding|ordinary|large-merchant",
  )
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: loadPerformanceDatabaseUrl() }),
})
const epoch = new Date("2026-09-01T00:00:00Z")
const dates = { createdAt: epoch, updatedAt: epoch }
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const range = (count: number) => Array.from({ length: count }, (_, i) => i)
async function batches<T>(rows: T[], write: (rows: T[]) => Promise<unknown>) {
  for (let offset = 0; offset < rows.length; offset += 500)
    await write(rows.slice(offset, offset + 500))
}

try {
  const identity = await db.$queryRaw<
    Array<{ database: string; version: number }>
  >`SELECT current_database() AS database, current_setting('server_version_num')::int AS version`
  if (
    identity[0]?.database !== performanceTarget.database ||
    Math.floor(identity[0].version / 10000) !== performanceTarget.postgresMajor
  )
    throw new Error("Unexpected server identity")
  // Never append into an unknown or partly seeded database. Recovery is explicit.
  if ((await db.tenant.count()) || (await db.user.count()))
    throw new Error(
      "Seed requires an empty disposable database; inspect or rehearse recovery first",
    )
  for (let tenantIndex = 0; tenantIndex < tier.tenants; tenantIndex++) {
    const prefix = `${performanceTarget.fixturePrefix}${tier.name}-${tenantIndex}`
    const id = (kind: string, index = 0) => `${prefix}-${kind}-${index}`
    const tenantId = id("tenant")
    const actorUserId = id("owner")
    const currencyCode = tenantIndex % 3 === 2 ? "USD" : "NGN"
    await db.user.create({
      data: {
        id: actorUserId,
        email: `${prefix}@example.invalid`,
        name: "Synthetic performance owner",
        emailVerified: true,
        ageBand: "ADULT",
        ageDeclaredAt: epoch,
        ...dates,
      },
    })
    await db.tenant.create({
      data: {
        id: tenantId,
        slug: prefix,
        name: `Synthetic ${tier.name} ${tenantIndex}`,
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        dataClassification: "QA",
        currencyCode,
        timezone: tenantIndex % 3 === 2 ? "America/New_York" : "Africa/Lagos",
        metadata: {
          fixtureVersion: performanceTarget.fixtureVersion,
          owner: "performance-foundation",
          tier: tier.name,
        },
        ...dates,
      },
    })
    await db.membership.create({
      data: {
        id: id("membership"),
        tenantId,
        userId: actorUserId,
        role: "OWNER",
        status: "ACTIVE",
        acceptedAt: epoch,
        ...dates,
      },
    })
    await db.store.createMany({
      data: range(tier.storesPerTenant).map((i) => ({
        id: id("store", i),
        tenantId,
        slug: `store-${i}`,
        name: `Synthetic Store ${i}`,
        status: "ACTIVE",
        currencyCode,
        ...dates,
      })),
    })
    const items = range(tier.catalogItemsPerTenant)
    const service = (i: number) => i % 10 === 9
    const active = (i: number) => i % 20 !== 18
    const products = items.filter((i) => !service(i))
    const services = items.filter(service)
    await batches(
      items.map(
        (i): Prisma.CatalogItemCreateManyInput => ({
          id: id("item", i),
          tenantId,
          slug: `item-${i}`,
          kind: service(i) ? "SERVICE" : "PRODUCT",
          status: active(i) ? "ACTIVE" : "ARCHIVED",
          name: `Synthetic item ${i}`,
          category: `Category ${i % 12}`,
          archivedAt: active(i) ? null : epoch,
          ...dates,
        }),
      ),
      (data) => db.catalogItem.createMany({ data }),
    )
    await batches(
      products.map((i) => ({
        id: id("product", i),
        catalogItemId: id("item", i),
        ...dates,
      })),
      (data) => db.catalogProduct.createMany({ data }),
    )
    await batches(
      services.map((i) => ({
        id: id("service", i),
        catalogItemId: id("item", i),
        ...dates,
      })),
      (data) => db.catalogService.createMany({ data }),
    )
    await batches(
      items.map(
        (i): Prisma.SellableVariantCreateManyInput => ({
          id: id("variant", i),
          catalogItemId: id("item", i),
          key: "default",
          name: `Synthetic item ${i}`,
          isDefault: true,
          status: active(i) ? "ACTIVE" : "ARCHIVED",
          ...dates,
        }),
      ),
      (data) => db.sellableVariant.createMany({ data }),
    )
    await batches(
      products.map(
        (i): Prisma.UnitConfigurationVersionCreateManyInput => ({
          id: id("configuration", i),
          productId: id("product", i),
          version: 1,
          status: "CURRENT",
          canonicalBalanceScale: 0,
          publishedAt: epoch,
          ...dates,
        }),
      ),
      (data) => db.unitConfigurationVersion.createMany({ data }),
    )
    await batches(
      products.map(
        (i): Prisma.InventoryUnitCreateManyInput => ({
          id: id("unit", i),
          configurationVersionId: id("configuration", i),
          key: "each",
          name: "Each",
          factor: "1",
          transactionScale: 0,
          stockBehavior: "CANONICAL_SHARED",
          ...dates,
        }),
      ),
      (data) => db.inventoryUnit.createMany({ data }),
    )
    await db.$executeRaw`UPDATE "CatalogProduct" p SET "currentUnitConfigurationVersionId" = v.id FROM "UnitConfigurationVersion" v, "CatalogItem" i WHERE v."productId"=p.id AND p."catalogItemId"=i.id AND i."tenantId"=${tenantId}`
    await batches(
      items.map(
        (i): Prisma.SellableOfferingCreateManyInput => ({
          id: id("offering", i),
          tenantId,
          catalogItemId: id("item", i),
          variantId: id("variant", i),
          key: "default",
          kind: service(i) ? "SERVICE" : "PRODUCT_UNIT",
          status: active(i) ? "ACTIVE" : "ARCHIVED",
          name: `Synthetic item ${i}`,
          pricingPolicy: "FIXED",
          fixedPriceMinor: 10000,
          currencyCode,
          ...dates,
        }),
      ),
      (data) => db.sellableOffering.createMany({ data }),
    )
    await batches(
      products.map((i) => ({
        id: id("product-offering", i),
        tenantId,
        offeringId: id("offering", i),
        inventoryUnitId: id("unit", i),
        sku: `${prefix}-${i}`,
        ...dates,
      })),
      (data) => db.productUnitOffering.createMany({ data }),
    )
    await batches(
      services.map(
        (i): Prisma.ServiceOfferingCreateManyInput => ({
          id: id("service-offering", i),
          offeringId: id("offering", i),
          workPolicy: "CHARGE_ONLY",
          authorizationPolicy: "ON_ORDER_CONFIRMATION",
          ...dates,
        }),
      ),
      (data) => db.serviceOffering.createMany({ data }),
    )
    const balances = products.flatMap((item) =>
      range(tier.storesPerTenant).map((store) => ({ item, store })),
    )
    await batches(
      items.flatMap((item) =>
        range(tier.storesPerTenant).map((store) => ({
          id: id(`availability-${store}`, item),
          offeringId: id("offering", item),
          storeId: id("store", store),
          isAvailable: active(item),
          ...dates,
        })),
      ),
      (data) => db.storeOfferingAvailability.createMany({ data }),
    )
    await batches(
      balances.map(
        ({ item, store }, i): Prisma.StockBalanceSourceCreateManyInput => ({
          id: id("balance", i),
          tenantId,
          storeId: id("store", store),
          productId: id("product", item),
          variantId: id("variant", item),
          inventoryUnitId: id("unit", item),
          kind: "SHARED_POOL",
          ...dates,
        }),
      ),
      (data) => db.stockBalanceSource.createMany({ data }),
    )
    const quantities = new Int32Array(balances.length)
    const revisions = new Int32Array(balances.length)
    // First pass creates the opening balance. Later traffic is skewed: 80% hits
    // the first 10% of balance sources; every fifth source alternates 0/1 stock.
    const hot = Math.max(1, Math.floor(balances.length / 10))
    for (let offset = 0; offset < tier.movementsPerTenant; offset += 500) {
      const operations: Prisma.StockOperationCreateManyInput[] = []
      const movements: Prisma.StockMovementCreateManyInput[] = []
      for (
        let n = offset;
        n < Math.min(offset + 500, tier.movementsPerTenant);
        n++
      ) {
        const balance =
          n < balances.length ? n : n % 10 < 8 ? n % hot : n % balances.length
        const { item, store } = balances[balance]
        const previous = quantities[balance]
        const effect =
          revisions[balance] === 0
            ? balance % 5 === 0
              ? 1
              : 100
            : balance % 5 === 0
              ? revisions[balance] % 2
                ? -1
                : 1
              : revisions[balance] % 2
                ? 1
                : -1
        quantities[balance] += effect
        revisions[balance]++
        const createdAt = new Date(epoch.getTime() + n * 1000)
        operations.push({
          id: id("operation", n),
          tenantId,
          storeId: id("store", store),
          type: revisions[balance] === 1 ? "OPENING_STOCK" : "ADJUSTMENT",
          clientOperationId: id("operation", n),
          payloadHash: digest(`${prefix}:movement:${n}`),
          actorUserId,
          source: "performance-fixture-v1",
          reason: "Synthetic non-commercial history",
          effectiveAt: createdAt,
          createdAt,
        })
        movements.push({
          id: id("movement", n),
          operationId: id("operation", n),
          balanceSourceId: id("balance", balance),
          configurationVersionId: id("configuration", item),
          enteredInventoryUnitId: id("unit", item),
          enteredQuantity: String(Math.abs(effect)),
          transactionScaleSnapshot: 0,
          unitFactorSnapshot: "1",
          signedCanonicalEffect: String(effect),
          previousOnHandQuantity: String(previous),
          resultingOnHandQuantity: String(quantities[balance]),
          createdAt,
        })
      }
      await db.$transaction([
        db.stockOperation.createMany({ data: operations }),
        db.stockMovement.createMany({ data: movements }),
      ])
      if (offset % 10000 === 0)
        console.log(
          JSON.stringify({
            tenant: tenantIndex,
            stage: "movements",
            completed: offset + movements.length,
            expected: tier.movementsPerTenant,
          }),
        )
    }
    // Reconcile projections from the immutable synthetic movement stream.
    await db.$executeRaw`UPDATE "StockBalanceSource" b SET "onHandQuantity"=m.quantity, revision=m.revision FROM (SELECT "balanceSourceId", sum("signedCanonicalEffect") AS quantity, count(*)::int AS revision FROM "StockMovement" GROUP BY "balanceSourceId") m WHERE b.id=m."balanceSourceId" AND b."tenantId"=${tenantId}`
    // Unpaid charge-only service history avoids inventing payment, fulfilment,
    // reservation or Finance journals. Product writes are measured through the
    // real command path, not these bulk historical records.
    for (let offset = 0; offset < tier.ordersPerTenant; offset += 500) {
      const indices = range(Math.min(500, tier.ordersPerTenant - offset)).map(
        (n) => offset + n,
      )
      const offeringIndex = (n: number) => services[n % services.length]
      const orders = indices.map(
        (n): Prisma.CommercialOrderCreateManyInput => ({
          id: id("order", n),
          tenantId,
          storeId: id("store", n % tier.storesPerTenant),
          clientOrderId: id("order", n),
          payloadHash: digest(`${prefix}:order:${n}`),
          orderNumber: `PERF-${n + 1}`,
          status: "CONFIRMED",
          paymentStatus: "PENDING",
          currencyCode,
          subtotalMinor: 10000,
          totalMinor: 10000,
          createdByUserId: actorUserId,
          customerName: `Synthetic customer ${n % 1000}`,
          createdAt: new Date(epoch.getTime() + n * 1000),
          updatedAt: epoch,
        }),
      )
      const lines = indices.map(
        (n): Prisma.CommercialOrderLineCreateManyInput => ({
          id: id("line", n),
          orderId: id("order", n),
          offeringId: id("offering", offeringIndex(n)),
          kind: "SERVICE",
          quantity: "1",
          unitPriceMinor: 10000,
          totalMinor: 10000,
          ...dates,
        }),
      )
      const snapshots = indices.map(
        (n): Prisma.OfferingSnapshotCreateManyInput => ({
          id: id("snapshot", n),
          orderLineId: id("line", n),
          catalogItemId: id("item", offeringIndex(n)),
          catalogItemName: `Synthetic item ${offeringIndex(n)}`,
          variantId: id("variant", offeringIndex(n)),
          variantName: `Synthetic item ${offeringIndex(n)}`,
          optionSelections: [],
          offeringId: id("offering", offeringIndex(n)),
          offeringName: `Synthetic item ${offeringIndex(n)}`,
          offeringKind: "SERVICE",
          pricingPolicy: "FIXED",
          currencyCode,
          unitPriceMinor: 10000,
          quantity: "1",
          totalMinor: 10000,
          serviceWorkPolicy: "CHARGE_ONLY",
          serviceAuthorizationPolicy: "ON_ORDER_CONFIRMATION",
          createdAt: epoch,
        }),
      )
      await db.$transaction([
        db.commercialOrder.createMany({ data: orders }),
        db.commercialOrderLine.createMany({ data: lines }),
        db.offeringSnapshot.createMany({ data: snapshots }),
      ])
    }
    await db.tenant.update({
      where: { id: tenantId },
      data: { lastCommercialOrderSequence: tier.ordersPerTenant },
    })
    console.log(
      JSON.stringify({
        tenant: tenantIndex,
        stage: "complete",
        tier: tier.name,
      }),
    )
  }
  console.log(
    JSON.stringify({
      fixtureVersion: performanceTarget.fixtureVersion,
      tier,
      status: "seeded-validation-required",
    }),
  )
} catch {
  console.error(
    "Fixture seeding failed. No automatic retry or cleanup; inspect the disposable target before recovery. Provider errors are withheld to protect credentials.",
  )
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
