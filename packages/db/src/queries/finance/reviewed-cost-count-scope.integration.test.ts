import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createCatalogItem } from "../catalog"
import { createStockCount } from "../inventory-operations"
import { cleanupConnectedCostAcceptance } from "./reviewed-cost-connected.integration-cleanup"
import { readReviewedCostDiscoveryScopeInTransaction as readScope } from "./reviewed-cost-discovery-scope"

setDefaultTimeout(180_000)
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error("Count scope acceptance requires exact development.")
}

describeWithServiceCommerceDatabase("Count document metadata scope", () => {
  test("zero-line scope proves actual Product, variant, canonical and observed unit ownership", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const tenantIds: string[] = []
    const userIds: string[] = []
    console.info(`count-scope QA run ${runId}`)
    try {
      const owner = await db.user.create({
        data: {
          name: "Count metadata QA",
          email: `opening-cost-${runId}@example.invalid`,
        },
      })
      userIds.push(owner.id)
      const balances = []
      for (const label of ["owned", "foreign"]) {
        const tenant = await db.tenant.create({
          data: {
            name: `Count ${label} QA`,
            slug: `opening-cost-count-${label}-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: owner.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(tenant.id)
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: `Private Count ${label} QA`,
            slug: `count-${label}-${runId}`,
            countryCode: "NG",
            status: "ACTIVE",
          },
        })
        const item = await createCatalogItem(db, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          storeId: store.id,
          clientOperationId: `count-${label}-${runId}`,
          kind: "product",
          name: `Count ${label}`,
          unitConfiguration: {
            canonicalBalanceScale: 18,
            units: [
              {
                key: "base",
                name: "unit",
                stockBehavior: "canonical_shared",
                transactionScale: 3,
                factor: "1",
              },
              {
                key: "pair",
                name: "pair",
                stockBehavior: "alternate_transaction",
                transactionScale: 3,
                factor: "2",
              },
            ],
          },
          variants: [
            {
              key: "default",
              name: "Default",
              isDefault: true,
              openingStockQuantity: "2",
              offerings: [
                {
                  key: "one",
                  name: "One unit",
                  fixedPriceMinor: 100,
                  pricingPolicy: "fixed",
                  inventoryUnitKey: "base",
                },
              ],
            },
          ],
        })
        const balance = item.product?.stockBalances[0]
        if (!balance) throw new Error("Count QA balance missing")
        balances.push(
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: balance.id },
          }),
        )
      }
      const [owned, foreign] = balances
      if (!owned || !foreign) throw new Error("Count QA scope missing")
      const alternate = await db.inventoryUnit.findFirstOrThrow({
        where: {
          configurationVersion: { productId: owned.productId },
          key: "pair",
        },
      })
      const count = await createStockCount(db, {
        tenantId: owned.tenantId,
        actorUserId: owner.id,
        storeId: owned.storeId,
        clientOperationId: `zero-count-${runId}`,
        schemaVersion: 1,
        lines: [
          {
            balanceSourceId: owned.id,
            expectedRevision: owned.revision,
            entries: [
              {
                enteredInventoryUnitId: alternate.id,
                enteredQuantity: "1",
              },
            ],
          },
        ],
      })
      const line = await db.stockCountLine.findFirstOrThrow({
        where: { stockCountId: count.id },
      })
      expect(line.varianceQuantity.toFixed()).toBe("0")
      // This tests document SQL scope; composed Book authorization is covered separately.
      const input = {
        tenantId: owned.tenantId,
        currencyCode: "NGN",
        bookId: "metadata-scope-only",
        references: [
          { kind: "COUNT", id: count.id },
          { kind: "COUNT_LINE", id: line.id },
        ],
      }
      const options = { maxWait: 10_000, timeout: 30_000 }
      await db.$transaction((tx) => readScope(tx, input), options)
      const probes = [
        { productId: foreign.productId },
        { variantId: foreign.variantId },
        { inventoryUnitId: foreign.inventoryUnitId },
      ]
      for (const data of probes)
        await expect(
          db.$transaction(async (tx) => {
            await tx.stockBalanceSource.update({
              where: { id: owned.id },
              data,
            })
            await readScope(tx, input)
            throw new Error("UNEXPECTED_SCOPE_ACCEPTANCE")
          }, options),
        ).rejects.toThrow("Connected sources are missing, crossed")
      await expect(
        db.$transaction(async (tx) => {
          await tx.stockCountLine.update({
            where: { id: line.id },
            data: { observedInventoryUnitId: foreign.inventoryUnitId },
          })
          await readScope(tx, input)
          throw new Error("UNEXPECTED_OBSERVATION_ACCEPTANCE")
        }, options),
      ).rejects.toThrow("Connected sources are missing, crossed")
      await db.$transaction((tx) => readScope(tx, input), options)
      expect(
        await db.financeJournalEntry.count({
          where: { book: { tenantId: owned.tenantId } },
        }),
      ).toBe(0)
    } finally {
      const remaining = await cleanupConnectedCostAcceptance(
        db,
        { runId, tenantIds, userIds, bookIds: [] },
        { stockCounts: true },
      )
      expect(remaining).toHaveLength(34)
      expect(remaining.every((count) => count === 0)).toBe(true)
      console.info(
        `count-scope cleanup complete ${runId}: 34 absence checks clear`,
      )
    }
  })
})
