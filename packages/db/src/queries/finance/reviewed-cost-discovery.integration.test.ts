import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createCatalogItem } from "../catalog"
import {
  postSingleBalanceStockOperation,
  transformPackagedStock,
} from "../inventory-operations"
import { lockFinanceBook } from "./access"
import { createFinanceBook } from "./accounts"
import { cleanupOpeningCostAcceptance } from "./opening-cost.integration-cleanup"
import { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import { readReviewedCostPhysicalHistoryInTransaction } from "./reviewed-cost-history"

setDefaultTimeout(600_000)
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error("Cost discovery acceptance requires exact development.")
}

describeWithServiceCommerceDatabase("connected cost source discovery", () => {
  test("discovers real package endpoints before stock locks, retains all history and rejects crossed scope", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    console.info(`cost-discovery QA run ${runId}`)
    const tenantIds: string[] = []
    const userIds: string[] = []
    const bookIds: string[] = []
    try {
      const owner = await db.user.create({
        data: {
          name: "Discovery QA owner",
          email: `opening-cost-${runId}@example.invalid`,
        },
      })
      userIds.push(owner.id)
      const manager = await db.user.create({
        data: {
          name: "Discovery QA Manager",
          email: `opening-cost-manager-${runId}@example.invalid`,
        },
      })
      userIds.push(manager.id)
      const tenant = await db.tenant.create({
        data: {
          name: "Discovery QA",
          slug: `opening-cost-discovery-${runId}`,
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          users: {
            create: [
              { userId: owner.id, role: "OWNER", status: "ACTIVE" },
              { userId: manager.id, role: "MANAGER", status: "ACTIVE" },
            ],
          },
        },
      })
      tenantIds.push(tenant.id)
      const store = await db.store.create({
        data: {
          tenantId: tenant.id,
          name: "Private discovery QA",
          slug: `discovery-${runId}`,
          countryCode: "NG",
          status: "ACTIVE",
        },
      })
      const foreignTenant = await db.tenant.create({
        data: {
          name: "Foreign discovery QA",
          slug: `opening-cost-discovery-foreign-${runId}`,
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
        },
      })
      tenantIds.push(foreignTenant.id)
      const foreignStore = await db.store.create({
        data: {
          tenantId: foreignTenant.id,
          name: "Private foreign discovery QA",
          slug: `discovery-foreign-${runId}`,
          countryCode: "NG",
          status: "ACTIVE",
        },
      })
      const book = await createFinanceBook(db, {
        tenantId: tenant.id,
        actorUserId: owner.id,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      })
      bookIds.push(book.id)
      const item = await createCatalogItem(db, {
        tenantId: tenant.id,
        storeId: store.id,
        actorUserId: owner.id,
        clientOperationId: `discovery-original-${runId}`,
        kind: "product",
        name: "Discovery original",
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
              key: "pack",
              name: "pair",
              stockBehavior: "packaged_stock",
              transactionScale: 0,
              factor: "2",
            },
            {
              key: "quad",
              name: "four units",
              stockBehavior: "packaged_stock",
              transactionScale: 0,
              factor: "4",
            },
          ],
        },
        variants: [
          {
            key: "default",
            name: "Default",
            isDefault: true,
            openingStockQuantity: "4",
            offerings: [
              {
                key: "one",
                name: "One unit",
                fixedPriceMinor: 5000,
                pricingPolicy: "fixed",
                inventoryUnitKey: "base",
              },
            ],
          },
        ],
      })
      const first = item.product?.stockBalances[0]
      if (!first) throw new Error("Discovery original balance missing")
      const canonical = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: first.id },
        include: { inventoryUnit: true },
      })
      const unit = await db.inventoryUnit.findFirstOrThrow({
        where: {
          configurationVersionId:
            canonical.inventoryUnit.configurationVersionId,
          stockBehavior: "PACKAGED_STOCK",
          factor: "4",
        },
      })
      const sourceUnit = await db.inventoryUnit.findFirstOrThrow({
        where: {
          configurationVersionId: unit.configurationVersionId,
          stockBehavior: "PACKAGED_STOCK",
          factor: "2",
        },
      })
      const base = await db.stockBalanceSource.create({
        data: {
          tenantId: tenant.id,
          storeId: store.id,
          productId: canonical.productId,
          variantId: canonical.variantId,
          inventoryUnitId: sourceUnit.id,
          kind: "PACKAGED_STOCK",
        },
      })
      await postSingleBalanceStockOperation(db, {
        tenantId: tenant.id,
        storeId: store.id,
        actorUserId: owner.id,
        clientOperationId: `discovery-receipt-${runId}`,
        balanceSourceId: base.id,
        enteredInventoryUnitId: sourceUnit.id,
        enteredQuantity: "4",
        expectedBalanceRevision: base.revision,
        expectedConfigurationVersionId: unit.configurationVersionId,
        direction: "increase",
        type: "receipt",
        source: "QA_DISCOVERY_RECEIPT",
        schemaVersion: 1,
        reason: "QA physical receipt; original cost remains unknown",
      })
      const pack = await db.stockBalanceSource.create({
        data: {
          tenantId: tenant.id,
          storeId: store.id,
          productId: base.productId,
          variantId: base.variantId,
          inventoryUnitId: unit.id,
          kind: "PACKAGED_STOCK",
        },
      })
      const operation = await transformPackagedStock(db, {
        tenantId: tenant.id,
        storeId: store.id,
        actorUserId: owner.id,
        clientOperationId: `discovery-package-${runId}`,
        expectedConfigurationVersionId: unit.configurationVersionId,
        reason: "QA actual paired package",
        schemaVersion: 1,
        source: "QA_DISCOVERY_PACKAGE",
        sourceBalanceRevision: base.revision + 1,
        sourceBalanceSourceId: base.id,
        sourceQuantity: "2",
        targetBalanceRevision: pack.revision,
        targetBalanceSourceId: pack.id,
        targetQuantity: "1",
      })
      const input = {
        tenantId: tenant.id,
        actorUserId: owner.id,
        bookId: book.id,
        balanceSourceIds: [pack.id],
      }
      const options = { maxWait: 10_000, timeout: 30_000 }
      const discovered = await db.$transaction(async (tx) => {
        const found = await discoverReviewedCostSourcesInTransaction(tx, input)
        const physical = await readReviewedCostPhysicalHistoryInTransaction(
          tx,
          {
            ...input,
            balanceSourceIds: found.balanceSourceIds,
            through: new Date(),
          },
        )
        expect(physical.balances).toHaveLength(2)
        expect(
          physical.balances.every((row) => row.physicalQuantityReconciled),
        ).toBe(true)
        return found
      }, options)
      expect(discovered.rootBalanceSourceIds).toEqual([pack.id])
      expect(discovered.balanceSourceIds).toEqual([base.id, pack.id].sort())
      expect(discovered.balanceSourceIds).not.toContain(canonical.id)
      expect(discovered.movementIds).toHaveLength(3)
      expect(discovered.operationIds).toHaveLength(2)
      expect(discovered.operationIds).toContain(operation.id)
      expect(discovered.requiresOwningSourceProof).toBe(true)
      expect(discovered.requiresMonetaryProof).toBe(true)
      expect(discovered.productReturnIds).toEqual([])
      const read = (changes: Partial<typeof input>) =>
        db.$transaction(
          (tx) =>
            discoverReviewedCostSourcesInTransaction(tx, {
              ...input,
              ...changes,
            }),
          options,
        )
      await expect(read({ actorUserId: manager.id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await expect(
        read({ balanceSourceIds: [pack.id, pack.id] }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        read({ balanceSourceIds: [randomUUID()] }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const allInput = { balanceSourceIds: [base.id, pack.id] }
      const forward = await read(allInput)
      expect(
        (
          await read({
            balanceSourceIds: [...allInput.balanceSourceIds].reverse(),
          })
        ).sourceDiscoveryHash,
      ).toBe(forward.sourceDiscoveryHash)
      // Recursive identity deduplication terminates a cycle. This deliberately
      // invalid QA source still requires owning-source/cycle proof before costing.
      const rollback = new Error("QA discovery rollback")
      await expect(
        db.$transaction(async (tx) => {
          await lockFinanceBook(tx, input)
          await tx.stockOperation.update({
            where: { id: operation.id },
            data: { linkedOperationId: operation.id },
          })
          const cyclic = await discoverReviewedCostSourcesInTransaction(
            tx,
            input,
          )
          expect(cyclic.operationIds).toEqual(discovered.operationIds)
          expect(cyclic.movementIds).toEqual(discovered.movementIds)
          throw rollback
        }, options),
      ).rejects.toBe(rollback)
      await expect(
        db.$transaction(async (tx) => {
          await lockFinanceBook(tx, input)
          await tx.stockOperation.create({
            data: {
              tenantId: foreignTenant.id,
              storeId: foreignStore.id,
              type: "ADJUSTMENT",
              actorUserId: owner.id,
              clientOperationId: `discovery-crossed-${runId}`,
              source: "QA_DISCOVERY_CROSSED",
              payloadHash: "a".repeat(64),
              linkedOperationId: operation.id,
            },
          })
          return discoverReviewedCostSourcesInTransaction(tx, input)
        }, options),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        db.$transaction(async (tx) => {
          await lockFinanceBook(tx, input)
          await tx.store.update({
            where: { id: store.id },
            data: { currencyCode: "USD" },
          })
          return discoverReviewedCostSourcesInTransaction(tx, input)
        }, options),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect((await read({})).sourceDiscoveryHash).toBe(
        discovered.sourceDiscoveryHash,
      )
      expect(
        await db.financeInventoryCostReview.count({
          where: { bookId: book.id },
        }),
      ).toBe(0)
      expect(
        await db.financeJournalEntry.count({ where: { bookId: book.id } }),
      ).toBe(0)
      console.info(`cost-discovery checks complete ${runId}`)
    } finally {
      const remaining = await cleanupOpeningCostAcceptance(db, {
        runId,
        tenantIds,
        userIds,
        bookIds,
      })
      expect(remaining).toHaveLength(23)
      expect(remaining.every((count) => count === 0)).toBe(true)
      console.info(
        `cost-discovery cleanup complete ${runId}: 23 absence checks clear`,
      )
    }
  })
})
