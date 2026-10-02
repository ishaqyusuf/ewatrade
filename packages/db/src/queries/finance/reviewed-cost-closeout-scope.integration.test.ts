import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createCatalogItem } from "../catalog"
import { createInventoryCloseout } from "../inventory-custody-transfers"
import {
  assertOpeningCostAcceptanceScope,
  cleanupOpeningCostAcceptance,
} from "./opening-cost.integration-cleanup"
import { readReviewedCostDiscoveryScopeInTransaction as readScope } from "./reviewed-cost-discovery-scope"

setDefaultTimeout(180_000)
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error("Closeout scope acceptance requires exact development.")
}

describeWithServiceCommerceDatabase("Closeout document metadata scope", () => {
  test("zero-line metadata proves matching parent identity and canonical unit without a physical graph", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const tenantIds: string[] = []
    const userIds: string[] = []
    const scope = { runId, tenantIds, userIds, bookIds: [] }
    console.info(`closeout-scope QA run ${runId}`)
    try {
      const owner = await db.user.create({
        data: {
          name: "Closeout metadata QA",
          email: `opening-cost-${runId}@example.invalid`,
        },
      })
      userIds.push(owner.id)
      const roots = []
      for (const label of ["owned", "foreign"]) {
        const tenant = await db.tenant.create({
          data: {
            name: `Closeout ${label} QA`,
            slug: `opening-cost-closeout-scope-${label}-${runId}`,
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
            name: `Private closeout ${label} QA`,
            slug: `closeout-scope-${label}-${runId}`,
            countryCode: "NG",
            status: "ACTIVE",
          },
        })
        const item = await createCatalogItem(db, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          storeId: store.id,
          clientOperationId: `closeout-scope-${label}-${runId}`,
          kind: "product",
          name: `Closeout scope ${label}`,
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
            ],
          },
          variants: [
            {
              key: "default",
              name: "Default",
              isDefault: true,
              openingStockQuantity: "1",
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
        const root = item.product?.stockBalances[0]
        if (!root) throw new Error("Closeout QA balance missing")
        roots.push(
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: root.id },
          }),
        )
      }
      const [owned, foreign] = roots
      if (!owned || !foreign) throw new Error("Closeout QA scope missing")
      const custody = await db.stockBalanceSource.create({
        data: {
          tenantId: owned.tenantId,
          storeId: owned.storeId,
          productId: owned.productId,
          variantId: owned.variantId,
          inventoryUnitId: owned.inventoryUnitId,
          kind: owned.kind,
          custodyType: "STAFF",
          custodyReferenceId: `scope-staff-${runId}`,
          parentBalanceSourceId: owned.id,
        },
      })
      const closeout = await createInventoryCloseout(db, {
        tenantId: owned.tenantId,
        actorUserId: owner.id,
        storeId: owned.storeId,
        clientOperationId: `zero-closeout-scope-${runId}`,
        custodyType: "staff",
        custodyReferenceId: custody.custodyReferenceId,
        schemaVersion: 1,
        declarations: [
          {
            balanceSourceId: custody.id,
            expectedRevision: custody.revision,
            declaredQuantity: "0",
          },
        ],
      })
      const line = await db.inventoryCloseoutLine.findFirstOrThrow({
        where: { closeoutId: closeout.id },
      })
      expect(line.varianceQuantity.toFixed()).toBe("0")
      // Documents retain zero siblings; neither metadata balance is a cost pool.
      const input = {
        tenantId: owned.tenantId,
        currencyCode: "NGN",
        bookId: "metadata-scope-only",
        references: [
          { kind: "CLOSEOUT", id: closeout.id },
          { kind: "CLOSEOUT_LINE", id: line.id },
        ],
      }
      const options = { maxWait: 10_000, timeout: 30_000 }
      await db.$transaction((tx) => readScope(tx, input), options)
      for (const data of [
        { productId: foreign.productId },
        { variantId: foreign.variantId },
        { inventoryUnitId: foreign.inventoryUnitId },
        { kind: "PACKAGED_STOCK" as const },
      ]) {
        await expect(
          db.$transaction(async (tx) => {
            await tx.stockBalanceSource.update({
              where: { id: owned.id },
              data,
            })
            await readScope(tx, input)
            throw new Error("UNEXPECTED_PARENT_ACCEPTANCE")
          }, options),
        ).rejects.toThrow("Connected sources are missing, crossed")
      }
      for (const data of [
        { factor: "2" },
        { stockBehavior: "ALTERNATE_TRANSACTION" as const },
      ]) {
        await expect(
          db.$transaction(async (tx) => {
            await tx.inventoryUnit.update({
              where: { id: owned.inventoryUnitId },
              data,
            })
            await readScope(tx, input)
            throw new Error("UNEXPECTED_CANONICAL_ACCEPTANCE")
          }, options),
        ).rejects.toThrow("Connected sources are missing, crossed")
      }
      await db.$transaction((tx) => readScope(tx, input), options)
      expect(
        await db.stockMovement.count({
          where: { balanceSourceId: custody.id },
        }),
      ).toBe(0)
      expect(
        await db.financeJournalEntry.count({
          where: { book: { tenantId: owned.tenantId } },
        }),
      ).toBe(0)
    } finally {
      await assertOpeningCostAcceptanceScope(db, scope)
      await db.inventoryCloseout.deleteMany({
        where: { tenantId: { in: tenantIds } },
      })
      const remaining = await cleanupOpeningCostAcceptance(db, scope)
      remaining.push(
        await db.inventoryCloseout.count({
          where: { tenantId: { in: tenantIds } },
        }),
        await db.inventoryCloseoutLine.count({
          where: { closeout: { tenantId: { in: tenantIds } } },
        }),
      )
      expect(remaining).toHaveLength(25)
      expect(remaining.every((count) => count === 0)).toBe(true)
      console.info(`closeout-scope cleanup complete ${runId}: 25 checks clear`)
    }
  })
})
