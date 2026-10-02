import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import type { StockCategorySelector } from "@ewatrade/utils/inventory-categories"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  QaDataClassification,
  TenantMode,
  TenantType,
} from "../../generated/prisma/enums"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import { listStockOperationCategoryNames } from "./inventory-categories"
import {
  correctStockOperation,
  postSingleBalanceStockOperation,
} from "./inventory-operations"
import {
  exportInventoryAuditRows,
  getStockOperationAudit,
  listInventoryOperationHistory,
} from "./inventory-reporting"

setDefaultTimeout(120_000)
describeWithServiceCommerceDatabase(
  "numeric reusable stock categories on Neon",
  () => {
    let db: PrismaClient
    let tenantId: string
    let otherTenantId: string
    let storeId: string
    let balances: string[]
    let actorUserId: string
    beforeAll(async () => {
      db = (await import("../client")).prisma
      actorUserId = (
        await db.user.create({
          data: {
            name: "Category Acceptance Operator",
            email: `category-test-${randomUUID()}@example.invalid`,
            emailVerified: true,
          },
        })
      ).id
      const tenant = await db.tenant.create({
        data: {
          slug: `stock-categories-${randomUUID()}`,
          name: "Category acceptance",
          type: TenantType.MERCHANT,
          enabledModes: [TenantMode.MERCHANT],
          dataClassification: QaDataClassification.QA,
        },
      })
      tenantId = tenant.id
      otherTenantId = (
        await db.tenant.create({
          data: {
            slug: `stock-categories-${randomUUID()}`,
            name: "Other category acceptance",
            type: TenantType.MERCHANT,
            enabledModes: [TenantMode.MERCHANT],
            dataClassification: QaDataClassification.QA,
          },
        })
      ).id
      storeId = (
        await db.store.create({
          data: { tenantId, slug: "farm", name: "Farm" },
        })
      ).id
      for (const [name, unit] of [
        ["Eggs", "eggs"],
        ["Layers", "birds"],
        ["Broilers", "birds"],
      ]) {
        // Seed existing private stock directly: this suite tests ledger writes,
        // independently of the currently closed public Catalog legal-publication gate.
        const item = await db.catalogItem.create({
          data: {
            tenantId,
            slug: `stock-${randomUUID()}`,
            kind: "PRODUCT",
            name: name ?? "Birds",
            product: { create: {} },
            variants: {
              create: {
                key: "default",
                name: name ?? "Birds",
                isDefault: true,
              },
            },
          },
          include: { product: true, variants: true },
        })
        if (!item.product || !item.variants[0])
          throw new Error("Incomplete stock fixture")
        const configuration = await db.unitConfigurationVersion.create({
          data: {
            productId: item.product.id,
            version: 1,
            status: "CURRENT",
            canonicalBalanceScale: 18,
            units: {
              create: {
                key: "unit",
                name: unit ?? "birds",
                factor: "1",
                stockBehavior: "CANONICAL_SHARED",
                transactionScale: 0,
              },
            },
          },
          include: { units: true },
        })
        if (!configuration.units[0]) throw new Error("Missing fixture unit")
        await db.catalogProduct.update({
          where: { id: item.product.id },
          data: { currentUnitConfigurationVersionId: configuration.id },
        })
        await db.stockBalanceSource.create({
          data: {
            tenantId,
            storeId,
            productId: item.product.id,
            variantId: item.variants[0].id,
            inventoryUnitId: configuration.units[0].id,
            kind: "SHARED_POOL",
            onHandQuantity: "500",
          },
        })
      }
      balances = (
        await db.stockBalanceSource.findMany({
          where: { tenantId },
          orderBy: { id: "asc" },
          select: { id: true },
        })
      ).map((row) => row.id)
    })
    afterAll(async () => {
      if (!db) return
      if (!tenantId) {
        if (actorUserId)
          await db.user.deleteMany({ where: { id: actorUserId } })
        return
      }
      await db.$transaction(async (tx) => {
        await tx.stockMovement.deleteMany({
          where: { operation: { tenantId } },
        })
        await tx.stockOperation.deleteMany({ where: { tenantId } })
        await tx.stockBalanceSource.deleteMany({ where: { tenantId } })
        await tx.catalogCommandReceipt.deleteMany({ where: { tenantId } })
        await tx.catalogItem.deleteMany({ where: { tenantId } })
        await tx.tenant.deleteMany({
          where: { id: { in: [tenantId, otherTenantId].filter(Boolean) } },
        })
        await tx.user.deleteMany({ where: { id: actorUserId } })
      })
    })
    async function input(
      categories?: StockCategorySelector[],
      balanceSourceId = balances[0],
      reason?: string,
    ) {
      if (!balanceSourceId) throw new Error("Missing acceptance balance")
      const balance = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: balanceSourceId },
        include: { inventoryUnit: true },
      })
      return {
        actorUserId,
        balanceSourceId,
        clientOperationId: randomUUID(),
        direction: "increase" as const,
        enteredInventoryUnitId: balance.inventoryUnitId,
        enteredQuantity: "20",
        expectedBalanceRevision: balance.revision,
        expectedConfigurationVersionId:
          balance.inventoryUnit.configurationVersionId,
        schemaVersion: 1,
        source: "category_acceptance",
        storeId,
        tenantId,
        type: "receipt" as "receipt" | "adjustment",
        ...(categories === undefined ? {} : { categories }),
        ...(reason === undefined ? {} : { reason }),
      }
    }
    test("20 eggs with three labels changes stock by 20; repeats reuse names and retries replay", async () => {
      const labels = [
        { name: "Egg collection" },
        { name: "Row 1" },
        { name: "Morning collection" },
      ]
      const command = await input(labels)
      const before = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: command.balanceSourceId },
      })
      const first = await postSingleBalanceStockOperation(db, command)
      expect(first.categories).toHaveLength(3)
      for (const category of first.categories) {
        expect(typeof category.id).toBe("number")
        expect(typeof category.categoryNameId).toBe("number")
      }
      expect(first.movements[0]?.resultingOnHandQuantity).toBe(
        String(Number(before.onHandQuantity) + 20),
      )
      expect((await postSingleBalanceStockOperation(db, command)).id).toBe(
        first.id,
      )
      const second = await postSingleBalanceStockOperation(
        db,
        await input(labels.map(({ name }) => ({ name: name.toUpperCase() }))),
      )
      expect(second.categories.map((row) => row.categoryNameId)).toEqual(
        first.categories.map((row) => row.categoryNameId),
      )
      expect(second.categories[0]?.id).not.toBe(first.categories[0]?.id)
      expect(
        await db.stockOperationCategoryName.count({ where: { tenantId } }),
      ).toBe(3)
      expect(
        (await listInventoryOperationHistory(db, { tenantId })).find(
          (row) => row.id === first.id,
        )?.categories,
      ).toEqual(first.categories)
      expect(
        (await getStockOperationAudit(db, { tenantId, operationId: first.id }))
          ?.categories,
      ).toEqual(first.categories)
      expect(
        (await exportInventoryAuditRows(db, { tenantId })).find(
          (row) => row.operationId === first.id,
        )?.categories,
      ).toBe("Egg collection | Row 1 | Morning collection")
      expect(
        (
          await listStockOperationCategoryNames(db, {
            tenantId,
            query: " EGG ",
          })
        )[0]?.name,
      ).toBe("Egg collection")
    })
    test("concurrent commands reuse normalized names; mixed ID/name input creates one link", async () => {
      const [left, right] = await Promise.all([
        input([{ name: "Shared label" }], balances[1]),
        input([{ name: "shared   label" }], balances[2]),
      ])
      const results = await Promise.all([
        postSingleBalanceStockOperation(db, left),
        postSingleBalanceStockOperation(db, right),
      ])
      const categoryNameId = results[0]?.categories[0]?.categoryNameId
      if (!categoryNameId) throw new Error("Missing shared category")
      expect(results[1]?.categories[0]?.categoryNameId).toBe(categoryNameId)
      const mixed = await postSingleBalanceStockOperation(
        db,
        await input([{ categoryNameId }, { name: "SHARED label" }]),
      )
      expect(mixed.categories).toHaveLength(1)
    })
    test("foreign category IDs are rejected, including direct composite-FK writes", async () => {
      const foreign = await db.stockOperationCategoryName.create({
        data: {
          tenantId: otherTenantId,
          name: "Egg collection",
          normalizedName: "egg collection",
        },
      })
      const command = await input([{ categoryNameId: foreign.id }])
      await expect(
        postSingleBalanceStockOperation(db, command),
      ).rejects.toThrow("Category not found")
      const operation = await db.stockOperation.findFirstOrThrow({
        where: { tenantId },
      })
      await expect(
        Promise.resolve(
          db.stockOperationCategory.create({
            data: {
              tenantId: otherTenantId,
              stockOperationId: operation.id,
              categoryNameId: foreign.id,
              position: 0,
            },
          }),
        ),
      ).rejects.toThrow()
      expect(
        await listStockOperationCategoryNames(db, { tenantId: otherTenantId }),
      ).toEqual([{ id: foreign.id, name: "Egg collection" }])
    })
    test("a revision failure rolls back newly upserted names", async () => {
      const command = await input([{ name: "Never committed" }])
      await expect(
        postSingleBalanceStockOperation(db, {
          ...command,
          expectedBalanceRevision: command.expectedBalanceRevision + 1,
        }),
      ).rejects.toThrow("changed before")
      expect(
        await db.stockOperationCategoryName.count({
          where: { tenantId, normalizedName: "never committed" },
        }),
      ).toBe(0)
      expect(
        await db.stockOperation.count({
          where: { tenantId, clientOperationId: command.clientOperationId },
        }),
      ).toBe(0)
    })
    test("bird loss decrements by two and quantity correction copies shared name IDs", async () => {
      const command = await input([{ name: "Mortality" }], balances[1])
      const loss = await postSingleBalanceStockOperation(db, {
        ...command,
        direction: "decrease",
        enteredQuantity: "2",
        type: "adjustment",
      })
      expect(
        Number(loss.movements[0]?.previousOnHandQuantity) -
          Number(loss.movements[0]?.resultingOnHandQuantity),
      ).toBe(2)
      const receipt = await postSingleBalanceStockOperation(
        db,
        await input([{ name: "Egg collection" }]),
      )
      const movement = receipt.movements[0]
      if (!movement) throw new Error("Missing receipt movement")
      const current = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: movement.balanceSourceId },
      })
      const correction = await correctStockOperation(db, {
        actorUserId,
        clientOperationId: randomUUID(),
        corrections: [
          {
            movementId: movement.id,
            correctedEnteredQuantity: "18",
            expectedBalanceRevision: current.revision,
          },
        ],
        reason: "Correct collection quantity",
        schemaVersion: 1,
        source: "category_acceptance",
        targetOperationId: receipt.id,
        tenantId,
      })
      expect(correction.categories.map((row) => row.categoryNameId)).toEqual(
        receipt.categories.map((row) => row.categoryNameId),
      )
      expect(correction.categories[0]?.id).not.toBe(receipt.categories[0]?.id)
      expect(
        (
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: current.id },
          })
        ).onHandQuantity.toString(),
      ).toBe(String(Number(current.onHandQuantity) - 2))
    })
    test("legacy hashes remain unchanged, retries work, changed categories fail replay", async () => {
      const command = await input(undefined, balances[2], "Legacy receipt")
      const operation = await postSingleBalanceStockOperation(db, command)
      const sorted = Object.fromEntries(
        Object.entries(command).sort(([a], [b]) => a.localeCompare(b)),
      )
      expect(
        (
          await db.stockOperation.findUniqueOrThrow({
            where: { id: operation.id },
          })
        ).payloadHash,
      ).toBe(createHash("sha256").update(JSON.stringify(sorted)).digest("hex"))
      expect((await postSingleBalanceStockOperation(db, command)).id).toBe(
        operation.id,
      )
      expect(operation.categories).toEqual([])
      await expect(
        postSingleBalanceStockOperation(db, {
          ...command,
          categories: [{ name: "Changed" }],
        }),
      ).rejects.toThrow("different input")
    })
  },
)
