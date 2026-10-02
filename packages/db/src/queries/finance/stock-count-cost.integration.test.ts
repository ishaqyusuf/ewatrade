import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createStockCount, finalizeStockCount } from "../inventory-operations"
import { createFinanceBook } from "./accounts"
import { recordFinancePurchase } from "./purchases"
import { createFinanceSupplier } from "./supplier-writes"

const BOOK_START = new Date("2026-01-01T00:00:00.000Z")
const RECEIPT_DATE = new Date("2026-09-15T12:00:00.000Z")
setDefaultTimeout(600_000)

type CountBalance = {
  balanceSourceId: string
  enteredInventoryUnitId: string
  expectedConfigurationVersionId: string
}

function assertCleanup(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

describeWithServiceCommerceDatabase("stock count valuation acceptance", () => {
  test("values counted shortages, preserves unknown gains, and composes once", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const tenantIds: string[] = []
    const storeIds: string[] = []
    const catalogItemIds: string[] = []
    const balanceSourceIds: string[] = []
    const stockCountIds: string[] = []
    const actorUserIds: string[] = []
    let cleanupBookId: string | undefined
    let supplierId: string | undefined

    try {
      const user = await db.user.create({
        data: {
          email: `stock-count-cost-${runId}@example.invalid`,
          name: "Stock count cost QA",
        },
      })
      actorUserIds.push(user.id)
      const tenant = await db.tenant.create({
        data: {
          name: "Stock count cost QA",
          slug: `stock-count-cost-${runId}`,
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          users: {
            create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      tenantIds.push(tenant.id)
      const actor = { tenantId: tenant.id, actorUserId: user.id }
      const managerUser = await db.user.create({
        data: {
          email: `stock-count-cost-manager-${runId}@example.invalid`,
          name: "Stock count cost manager QA",
        },
      })
      actorUserIds.push(managerUser.id)
      await db.membership.create({
        data: {
          tenantId: tenant.id,
          userId: managerUser.id,
          role: "MANAGER",
          status: "ACTIVE",
        },
      })
      const foreignTenant = await db.tenant.create({
        data: {
          name: "Foreign stock count cost QA",
          slug: `stock-count-cost-foreign-${runId}`,
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          users: {
            create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      tenantIds.push(foreignTenant.id)
      const store = await db.store.create({
        data: {
          tenantId: tenant.id,
          name: "Private stock count cost store",
          slug: `stock-count-cost-${runId}`,
          status: "ACTIVE",
        },
      })
      storeIds.push(store.id)
      const noBookStore = await db.store.create({
        data: {
          tenantId: foreignTenant.id,
          name: "Private no-book stock count store",
          slug: `stock-count-cost-no-book-${runId}`,
          status: "ACTIVE",
        },
      })
      storeIds.push(noBookStore.id)

      const item = await db.catalogItem.create({
        data: {
          tenantId: tenant.id,
          slug: `stock-count-cost-${runId}`,
          kind: "PRODUCT",
          name: "Packaged stock count QA Product",
          product: { create: {} },
          variants: {
            create: [
              { key: "shortage", name: "Shortage", isDefault: true },
              { key: "gain", name: "Gain", isDefault: false },
              { key: "opening", name: "Opening", isDefault: false },
              { key: "zero", name: "Zero variance", isDefault: false },
            ],
          },
        },
        include: { product: true, variants: true },
      })
      catalogItemIds.push(item.id)
      const product = item.product
      const shortageVariant = item.variants.find(
        (variant) => variant.key === "shortage",
      )
      const gainVariant = item.variants.find(
        (variant) => variant.key === "gain",
      )
      const openingVariant = item.variants.find(
        (variant) => variant.key === "opening",
      )
      const zeroVariant = item.variants.find(
        (variant) => variant.key === "zero",
      )
      if (
        !product ||
        !shortageVariant ||
        !gainVariant ||
        !openingVariant ||
        !zeroVariant
      ) {
        throw new Error("Incomplete stock count cost Product fixture")
      }
      const productId = product.id
      const configuration = await db.unitConfigurationVersion.create({
        data: {
          productId,
          version: 1,
          status: "CURRENT",
          canonicalBalanceScale: 18,
          units: {
            create: [
              {
                key: "unit",
                name: "unit",
                factor: "1",
                stockBehavior: "CANONICAL_SHARED",
                transactionScale: 3,
              },
              {
                key: "case",
                name: "case",
                factor: "12",
                stockBehavior: "PACKAGED_STOCK",
                transactionScale: 3,
              },
            ],
          },
        },
        include: { units: true },
      })
      const canonicalUnit = configuration.units.find(
        (unit) => unit.key === "unit",
      )
      const caseUnit = configuration.units.find((unit) => unit.key === "case")
      if (!canonicalUnit || !caseUnit) {
        throw new Error("Missing packaged or canonical inventory unit")
      }
      expect(canonicalUnit.factor.toFixed()).toBe("1")
      expect(caseUnit.factor.toFixed()).toBe("12")
      const configurationId = configuration.id
      const caseUnitId = caseUnit.id
      await db.catalogProduct.update({
        where: { id: productId },
        data: { currentUnitConfigurationVersionId: configurationId },
      })

      async function createBalance(
        variantId: string,
        initialQuantity: string,
        targetStoreId: string,
        targetTenantId: string,
      ): Promise<CountBalance> {
        const balance = await db.stockBalanceSource.create({
          data: {
            tenantId: targetTenantId,
            storeId: targetStoreId,
            productId,
            variantId,
            inventoryUnitId: caseUnitId,
            kind: "PACKAGED_STOCK",
            onHandQuantity: initialQuantity,
          },
        })
        balanceSourceIds.push(balance.id)
        return {
          balanceSourceId: balance.id,
          enteredInventoryUnitId: caseUnitId,
          expectedConfigurationVersionId: configurationId,
        }
      }

      const shortageBalance = await createBalance(
        shortageVariant.id,
        "0",
        store.id,
        tenant.id,
      )
      const gainBalance = await createBalance(
        gainVariant.id,
        "0",
        store.id,
        tenant.id,
      )
      const openingBalance = await createBalance(
        openingVariant.id,
        "1",
        store.id,
        tenant.id,
      )
      const zeroBalance = await createBalance(
        zeroVariant.id,
        "1",
        store.id,
        tenant.id,
      )

      // A separate tenant/store has no FinanceBook. It exercises the existing
      // inventory-only count workflow without creating financial artifacts.
      const noBookItem = await db.catalogItem.create({
        data: {
          tenantId: foreignTenant.id,
          slug: `stock-count-cost-no-book-${runId}`,
          kind: "PRODUCT",
          name: "No-book count QA Product",
          product: { create: {} },
          variants: {
            create: { key: "default", name: "Default", isDefault: true },
          },
        },
        include: { product: true, variants: true },
      })
      catalogItemIds.push(noBookItem.id)
      const noBookProduct = noBookItem.product
      const noBookVariant = noBookItem.variants[0]
      if (!noBookProduct || !noBookVariant) {
        throw new Error("Incomplete no-book count Product fixture")
      }
      const noBookConfiguration = await db.unitConfigurationVersion.create({
        data: {
          productId: noBookProduct.id,
          version: 1,
          status: "CURRENT",
          canonicalBalanceScale: 18,
          units: {
            create: [
              {
                key: "unit",
                name: "unit",
                factor: "1",
                stockBehavior: "CANONICAL_SHARED",
                transactionScale: 3,
              },
              {
                key: "case",
                name: "case",
                factor: "12",
                stockBehavior: "PACKAGED_STOCK",
                transactionScale: 3,
              },
            ],
          },
        },
        include: { units: true },
      })
      const noBookUnit = noBookConfiguration.units.find(
        (unit) => unit.key === "case",
      )
      if (!noBookUnit) throw new Error("Missing no-book case unit")
      const noBookConfigurationId = noBookConfiguration.id
      const noBookUnitId = noBookUnit.id
      await db.catalogProduct.update({
        where: { id: noBookProduct.id },
        data: {
          currentUnitConfigurationVersionId: noBookConfigurationId,
        },
      })
      const noBookBalanceRecord = await db.stockBalanceSource.create({
        data: {
          tenantId: foreignTenant.id,
          storeId: noBookStore.id,
          productId: noBookProduct.id,
          variantId: noBookVariant.id,
          inventoryUnitId: noBookUnitId,
          kind: "PACKAGED_STOCK",
          onHandQuantity: "1",
        },
      })
      balanceSourceIds.push(noBookBalanceRecord.id)
      const noBookBalance: CountBalance = {
        balanceSourceId: noBookBalanceRecord.id,
        enteredInventoryUnitId: noBookUnitId,
        expectedConfigurationVersionId: noBookConfigurationId,
      }

      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: BOOK_START,
      })
      cleanupBookId = book.id
      const bookId = book.id
      const expense = await db.financeAccount.findUnique({
        where: { bookId_code: { bookId, code: "6000" } },
      })
      const inventory = await db.financeAccount.findUnique({
        where: { bookId_code: { bookId, code: "1300" } },
      })
      if (!expense || !inventory) {
        throw new Error("Missing stock count shortage control accounts")
      }
      const supplier = await createFinanceSupplier(db, {
        ...actor,
        bookId,
        clientCommandId: `stock-count-cost-supplier-${runId}`,
        code: `SC-${runId.slice(0, 8)}`,
        name: "Stock count cost QA supplier",
      })
      supplierId = supplier.id

      async function receive(
        balance: CountBalance,
        label: string,
        amountMinor: string,
        enteredQuantity: string,
        expectedBalanceRevision: number,
        incurredAt: Date,
      ) {
        return recordFinancePurchase(db, {
          ...actor,
          bookId,
          clientCommandId: `stock-count-cost-${label}-${runId}`,
          supplierId: supplier.id,
          storeId: store.id,
          description: `QA ${label}`,
          incurredAt,
          lines: [
            {
              balanceSourceId: balance.balanceSourceId,
              enteredInventoryUnitId: balance.enteredInventoryUnitId,
              expectedConfigurationVersionId:
                balance.expectedConfigurationVersionId,
              description: `QA ${label}`,
              amountMinor,
              enteredQuantity,
              expectedBalanceRevision,
              categories: [{ name: `Count ${label} ${runId.slice(0, 8)}` }],
            },
          ],
        })
      }

      await receive(
        shortageBalance,
        "opening-known",
        "1200",
        "2",
        0,
        RECEIPT_DATE,
      )
      await receive(gainBalance, "gain-known", "333", "1", 0, RECEIPT_DATE)

      async function count(
        label: string,
        lines: Array<{
          balance: CountBalance
          expectedRevision: number
          quantity: string
        }>,
      ) {
        const created = await createStockCount(db, {
          actorUserId: user.id,
          clientOperationId: `stock-count-cost-draft-${label}-${runId}`,
          lines: lines.map(({ balance, expectedRevision, quantity }) => ({
            balanceSourceId: balance.balanceSourceId,
            expectedRevision,
            entries: [
              {
                enteredInventoryUnitId: balance.enteredInventoryUnitId,
                enteredQuantity: quantity,
              },
            ],
          })),
          reason: `QA stock count ${label}`,
          schemaVersion: 1,
          storeId: store.id,
          tenantId: tenant.id,
        })
        stockCountIds.push(created.id)
        return created
      }

      const firstCount = await count("variance-set", [
        { balance: shortageBalance, expectedRevision: 1, quantity: "1" },
        { balance: gainBalance, expectedRevision: 1, quantity: "2" },
        { balance: openingBalance, expectedRevision: 0, quantity: "0" },
        { balance: zeroBalance, expectedRevision: 0, quantity: "1" },
      ])
      const firstInput = {
        actorUserId: managerUser.id,
        clientOperationId: `stock-count-cost-finalize-first-${runId}`,
        reason: "QA measured count variance",
        schemaVersion: 1,
        stockCountId: firstCount.id,
        tenantId: tenant.id,
      }
      const [firstOperation, concurrentReplay] = await Promise.all([
        finalizeStockCount(db, firstInput),
        finalizeStockCount(db, firstInput),
      ])
      expect(concurrentReplay).toEqual(firstOperation)
      expect(firstOperation.type).toBe("COUNT_RECONCILIATION")
      expect(firstOperation.movements).toHaveLength(3)
      expect(
        await db.stockOperation.count({
          where: {
            tenantId: tenant.id,
            clientOperationId: firstInput.clientOperationId,
          },
        }),
      ).toBe(1)
      expect(
        firstOperation.movements.map((movement) => [
          movement.balanceSourceId,
          movement.signedCanonicalEffect,
        ]),
      ).toEqual(
        expect.arrayContaining([
          [shortageBalance.balanceSourceId, "-12"],
          [gainBalance.balanceSourceId, "12"],
          [openingBalance.balanceSourceId, "-12"],
        ]),
      )

      const eventsAfterCount = await db.financeInventoryValuationEvent.findMany(
        {
          where: {
            bookId,
            sourceKind: "STOCK_COUNT",
            sourceId: firstCount.id,
          },
          include: { stockMovement: true, pool: true },
          orderBy: { stockMovementId: "asc" },
        },
      )
      expect(eventsAfterCount).toHaveLength(3)
      const shortageEvent = eventsAfterCount.find(
        (event) => event.balanceSourceId === shortageBalance.balanceSourceId,
      )
      const gainEvent = eventsAfterCount.find(
        (event) => event.balanceSourceId === gainBalance.balanceSourceId,
      )
      const openingEvent = eventsAfterCount.find(
        (event) => event.balanceSourceId === openingBalance.balanceSourceId,
      )
      if (!shortageEvent || !gainEvent || !openingEvent) {
        throw new Error("Missing stock count valuation event")
      }
      expect(shortageEvent).toMatchObject({
        kind: "ADJUSTMENT",
        sourceKind: "STOCK_COUNT",
        sourceId: firstCount.id,
        sourceCostMinor: BigInt(600),
        valueBeforeMinor: BigInt(1200),
        valueDeltaMinor: BigInt(-600),
        valueAfterMinor: BigInt(600),
        unknownReason: null,
      })
      expect(shortageEvent.canonicalEffect.toFixed()).toBe("-12")
      expect(shortageEvent.quantityBefore.toFixed()).toBe("24")
      expect(shortageEvent.quantityAfter.toFixed()).toBe("12")
      expect(shortageEvent.stockMovement.signedCanonicalEffect.toFixed()).toBe(
        "-12",
      )
      expect(shortageEvent.stockOperationId).toBe(firstOperation.id)
      const shortageMovement = firstOperation.movements.find(
        (movement) =>
          movement.balanceSourceId === shortageBalance.balanceSourceId,
      )
      if (!shortageMovement) throw new Error("Missing shortage stock movement")
      expect(shortageEvent.stockMovementId).toBe(shortageMovement.id)
      expect(gainEvent.kind).toBe("ADJUSTMENT")
      expect(gainEvent.canonicalEffect.toFixed()).toBe("12")
      expect(gainEvent.quantityBefore.toFixed()).toBe("12")
      expect(gainEvent.quantityAfter.toFixed()).toBe("24")
      expect(gainEvent.valueBeforeMinor).toBe(BigInt(333))
      expect(gainEvent.sourceCostMinor).toBeNull()
      expect(gainEvent.valueDeltaMinor).toBeNull()
      expect(gainEvent.valueAfterMinor).toBeNull()
      expect(gainEvent.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
      expect(gainEvent.pool.valueMinor).toBeNull()
      expect(gainEvent.pool.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
      expect(gainEvent.pool.quantity.toFixed()).toBe("24")
      expect(openingEvent.sourceCostMinor).toBeNull()
      expect(openingEvent.valueDeltaMinor).toBeNull()
      expect(openingEvent.valueAfterMinor).toBeNull()
      expect(openingEvent.unknownReason).toBe("MISSING_OPENING_COST")

      const countJournal = await db.financeJournalEntry.findUniqueOrThrow({
        where: {
          bookId_sourceKind_sourceId: {
            bookId,
            sourceKind: "INVENTORY_COUNT_SHORTAGE",
            sourceId: shortageEvent.stockMovementId,
          },
        },
        include: { lines: { orderBy: { accountId: "asc" } } },
      })
      expect(countJournal.lines).toHaveLength(2)
      expect(countJournal.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            accountId: expense.id,
            debitMinor: BigInt(600),
            creditMinor: BigInt(0),
          }),
          expect.objectContaining({
            accountId: inventory.id,
            debitMinor: BigInt(0),
            creditMinor: BigInt(600),
          }),
        ]),
      )
      expect(
        await db.financeJournalEntry.count({
          where: { bookId, sourceKind: "INVENTORY_COUNT_SHORTAGE" },
        }),
      ).toBe(1)

      const countStatus = await db.stockCount.findUniqueOrThrow({
        where: { id: firstCount.id },
      })
      expect(countStatus.status).toBe("FINALIZED")
      expect(countStatus.finalizedOperationId).toBe(firstOperation.id)
      expect(countStatus.actorUserId).toBe(user.id)
      const finalizedOperationRecord =
        await db.stockOperation.findUniqueOrThrow({
          where: { id: firstOperation.id },
        })
      expect(finalizedOperationRecord.actorUserId).toBe(managerUser.id)
      if (!countStatus.finalizedAt) {
        throw new Error("Finalized Stock Count has no finalization timestamp")
      }
      expect(finalizedOperationRecord.effectiveAt).toEqual(
        countStatus.finalizedAt,
      )
      expect(shortageEvent.actorUserId).toBe(managerUser.id)
      expect(shortageEvent.effectiveAt).toEqual(countStatus.finalizedAt)
      expect(countJournal.actorUserId).toBe(managerUser.id)
      expect(countJournal.effectiveAt).toEqual(countStatus.finalizedAt)
      const zeroVarianceEvents = await db.financeInventoryValuationEvent.count({
        where: { bookId, balanceSourceId: zeroBalance.balanceSourceId },
      })
      expect(zeroVarianceEvents).toBe(0)
      expect(
        await db.financeInventoryPool.count({
          where: { bookId, balanceSourceId: zeroBalance.balanceSourceId },
        }),
      ).toBe(0)
      expect(
        await db.stockMovement.count({
          where: {
            operationId: firstOperation.id,
            balanceSourceId: zeroBalance.balanceSourceId,
          },
        }),
      ).toBe(0)
      expect(
        firstOperation.movements.some(
          (movement) =>
            movement.balanceSourceId === zeroBalance.balanceSourceId,
        ),
      ).toBe(false)

      const laterReceiptDate = new Date()
      await receive(
        shortageBalance,
        "later-receipt",
        "700",
        "1",
        2,
        laterReceiptDate,
      )
      const beforeReplayPool = await db.financeInventoryPool.findUniqueOrThrow({
        where: {
          bookId_balanceSourceId: {
            bookId,
            balanceSourceId: shortageBalance.balanceSourceId,
          },
        },
      })
      expect(beforeReplayPool.quantity.toFixed()).toBe("24")
      expect(beforeReplayPool.valueMinor).toBe(BigInt(1300))
      const replaySnapshot = await db.financeInventoryValuationEvent.findMany({
        where: { bookId, sourceId: firstCount.id },
        orderBy: { stockMovementId: "asc" },
      })
      const replayJournalCount = await db.financeJournalEntry.count({
        where: { bookId, sourceKind: "INVENTORY_COUNT_SHORTAGE" },
      })
      expect(await finalizeStockCount(db, firstInput)).toEqual(firstOperation)
      expect(
        await db.financeInventoryValuationEvent.findMany({
          where: { bookId, sourceId: firstCount.id },
          orderBy: { stockMovementId: "asc" },
        }),
      ).toEqual(replaySnapshot)
      expect(
        await db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId,
              balanceSourceId: shortageBalance.balanceSourceId,
            },
          },
        }),
      ).toEqual(beforeReplayPool)
      expect(
        await db.financeJournalEntry.count({
          where: { bookId, sourceKind: "INVENTORY_COUNT_SHORTAGE" },
        }),
      ).toBe(replayJournalCount)

      const depletionCount = await count("full-depletion", [
        { balance: shortageBalance, expectedRevision: 3, quantity: "0" },
      ])
      const depletionOperation = await finalizeStockCount(db, {
        actorUserId: user.id,
        clientOperationId: `stock-count-cost-finalize-depletion-${runId}`,
        reason: "QA count confirms all remaining cases depleted",
        schemaVersion: 1,
        stockCountId: depletionCount.id,
        tenantId: tenant.id,
      })
      expect(depletionOperation.movements).toHaveLength(1)
      const depletionEvent =
        await db.financeInventoryValuationEvent.findFirstOrThrow({
          where: {
            bookId,
            sourceKind: "STOCK_COUNT",
            sourceId: depletionCount.id,
          },
        })
      expect(depletionEvent.canonicalEffect.toFixed()).toBe("-24")
      expect(depletionEvent.sourceCostMinor).toBe(BigInt(1300))
      expect(depletionEvent.valueBeforeMinor).toBe(BigInt(1300))
      expect(depletionEvent.valueDeltaMinor).toBe(BigInt(-1300))
      expect(depletionEvent.valueAfterMinor).toBe(BigInt(0))
      const depletedPool = await db.financeInventoryPool.findUniqueOrThrow({
        where: {
          bookId_balanceSourceId: {
            bookId,
            balanceSourceId: shortageBalance.balanceSourceId,
          },
        },
      })
      expect(depletedPool.quantity.toFixed()).toBe("0")
      expect(depletedPool.valueMinor).toBe(BigInt(0))

      const closedCount = await count("closed-period", [
        { balance: gainBalance, expectedRevision: 2, quantity: "1" },
      ])
      const closedOperationInput = {
        actorUserId: user.id,
        clientOperationId: `stock-count-cost-closed-${runId}`,
        reason: "QA closed-period count attempt",
        schemaVersion: 1,
        stockCountId: closedCount.id,
        tenantId: tenant.id,
      }
      const closedBeforeBalance = await db.stockBalanceSource.findUniqueOrThrow(
        {
          where: { id: gainBalance.balanceSourceId },
        },
      )
      const closedBeforePool = await db.financeInventoryPool.findUniqueOrThrow({
        where: {
          bookId_balanceSourceId: {
            bookId,
            balanceSourceId: gainBalance.balanceSourceId,
          },
        },
      })
      const closedBeforeEvents = await db.financeInventoryValuationEvent.count({
        where: { bookId },
      })
      const closedBeforeJournals = await db.financeJournalEntry.count({
        where: { bookId },
      })
      await db.financeBook.update({
        where: { id: bookId },
        data: { closedThrough: new Date(Date.now() + 60_000) },
      })
      try {
        await expect(
          finalizeStockCount(db, closedOperationInput),
        ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      } finally {
        await db.financeBook.update({
          where: { id: bookId },
          data: { closedThrough: null },
        })
      }
      expect(
        await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: gainBalance.balanceSourceId },
        }),
      ).toEqual(closedBeforeBalance)
      expect(
        await db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId,
              balanceSourceId: gainBalance.balanceSourceId,
            },
          },
        }),
      ).toEqual(closedBeforePool)
      expect(
        await db.stockCount.findUniqueOrThrow({
          where: { id: closedCount.id },
        }),
      ).toMatchObject({ status: "DRAFT", finalizedOperationId: null })
      expect(
        await db.financeInventoryValuationEvent.count({ where: { bookId } }),
      ).toBe(closedBeforeEvents)
      expect(await db.financeJournalEntry.count({ where: { bookId } })).toBe(
        closedBeforeJournals,
      )
      expect(
        await db.stockOperation.count({
          where: {
            tenantId: tenant.id,
            clientOperationId: closedOperationInput.clientOperationId,
          },
        }),
      ).toBe(0)
      await expect(
        finalizeStockCount(db, {
          ...closedOperationInput,
          tenantId: foreignTenant.id,
        }),
      ).rejects.toMatchObject({ code: "STOCK_COUNT_NOT_FOUND" })

      const noBookCount = await createStockCount(db, {
        actorUserId: user.id,
        clientOperationId: `stock-count-cost-no-book-draft-${runId}`,
        lines: [
          {
            balanceSourceId: noBookBalance.balanceSourceId,
            expectedRevision: 0,
            entries: [
              {
                enteredInventoryUnitId: noBookBalance.enteredInventoryUnitId,
                enteredQuantity: "0",
              },
            ],
          },
        ],
        reason: "QA no-book count",
        schemaVersion: 1,
        storeId: noBookStore.id,
        tenantId: foreignTenant.id,
      })
      stockCountIds.push(noBookCount.id)
      const noBookEventsBefore = await db.financeInventoryValuationEvent.count({
        where: { tenantId: foreignTenant.id },
      })
      const noBookPoolsBefore = await db.financeInventoryPool.count({
        where: { tenantId: foreignTenant.id },
      })
      const noBookOperation = await finalizeStockCount(db, {
        actorUserId: user.id,
        clientOperationId: `stock-count-cost-no-book-finalize-${runId}`,
        reason: "QA no-book count finalization",
        schemaVersion: 1,
        stockCountId: noBookCount.id,
        tenantId: foreignTenant.id,
      })
      expect(noBookOperation.movements).toHaveLength(1)
      const noBookBalanceAfter = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: noBookBalance.balanceSourceId },
      })
      expect(noBookBalanceAfter.onHandQuantity.toString()).toBe("0")
      expect(noBookBalanceAfter.revision).toBe(1)
      expect(
        await db.financeInventoryValuationEvent.count({
          where: { tenantId: foreignTenant.id },
        }),
      ).toBe(noBookEventsBefore)
      expect(
        await db.financeInventoryPool.count({
          where: { tenantId: foreignTenant.id },
        }),
      ).toBe(noBookPoolsBefore)
      expect(
        await db.financeJournalEntry.count({
          where: { book: { tenantId: foreignTenant.id } },
        }),
      ).toBe(0)
      expect(
        await db.financeBook.count({ where: { tenantId: foreignTenant.id } }),
      ).toBe(0)
    } finally {
      await db.$transaction(
        async (tx) => {
          if (cleanupBookId) {
            await tx.financeBook.updateMany({
              where: { id: cleanupBookId },
              data: { closedThrough: null },
            })
          }
          if (stockCountIds.length) {
            await tx.stockCountEntry.deleteMany({
              where: {
                stockCountLine: { stockCountId: { in: stockCountIds } },
              },
            })
            await tx.stockCountLine.deleteMany({
              where: { stockCountId: { in: stockCountIds } },
            })
            await tx.stockCount.deleteMany({
              where: { id: { in: stockCountIds } },
            })
          }
          if (cleanupBookId) {
            await tx.financeInventoryValuationEvent.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financeInventoryPool.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financePurchaseReceiptLine.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financeSupplierEntry.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financeBillPayment.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financeBillLine.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financeBill.deleteMany({
              where: { bookId: cleanupBookId },
            })
          }
          if (tenantIds.length) {
            await tx.stockMovement.deleteMany({
              where: { operation: { tenantId: { in: tenantIds } } },
            })
            await tx.stockOperationCategory.deleteMany({
              where: { tenantId: { in: tenantIds } },
            })
            await tx.stockOperation.deleteMany({
              where: { tenantId: { in: tenantIds } },
            })
            await tx.stockBalanceSource.deleteMany({
              where: { tenantId: { in: tenantIds } },
            })
            await tx.stockOperationCategoryName.deleteMany({
              where: { tenantId: { in: tenantIds } },
            })
          }
          if (cleanupBookId) {
            await tx.financeSupplierAccount.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financeJournalLine.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financeJournalEntry.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financeCommand.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financeAccount.deleteMany({
              where: { bookId: cleanupBookId },
            })
            await tx.financeBook.deleteMany({ where: { id: cleanupBookId } })
          }
          if (catalogItemIds.length) {
            await tx.catalogItem.deleteMany({
              where: { id: { in: catalogItemIds } },
            })
          }
          if (storeIds.length) {
            await tx.store.deleteMany({ where: { id: { in: storeIds } } })
          }
          if (tenantIds.length) {
            await tx.membership.deleteMany({
              where: {
                tenantId: { in: tenantIds },
                userId: { in: actorUserIds },
              },
            })
            await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
          }
          if (actorUserIds.length) {
            await tx.user.deleteMany({ where: { id: { in: actorUserIds } } })
          }
        },
        { maxWait: 10_000, timeout: 30_000 },
      )

      const [
        remainingTenants,
        remainingStores,
        remainingItems,
        remainingBooks,
        remainingSuppliers,
        remainingUsers,
        remainingCounts,
        remainingLines,
        remainingEntries,
        remainingPools,
        remainingEvents,
        remainingReceipts,
        remainingBills,
        remainingJournalEntries,
        remainingJournalLines,
        remainingFinanceCommands,
        remainingStockOperations,
        remainingStockMovements,
        remainingStockCategories,
        remainingCategoryNames,
        remainingBalances,
      ] = await Promise.all([
        db.tenant.count({ where: { id: { in: tenantIds } } }),
        db.store.count({ where: { id: { in: storeIds } } }),
        db.catalogItem.count({ where: { id: { in: catalogItemIds } } }),
        cleanupBookId
          ? db.financeBook.count({ where: { id: cleanupBookId } })
          : Promise.resolve(0),
        supplierId
          ? db.financeSupplierAccount.count({ where: { id: supplierId } })
          : Promise.resolve(0),
        db.user.count({ where: { id: { in: actorUserIds } } }),
        db.stockCount.count({ where: { id: { in: stockCountIds } } }),
        db.stockCountLine.count({
          where: { stockCountId: { in: stockCountIds } },
        }),
        db.stockCountEntry.count({
          where: { stockCountLine: { stockCountId: { in: stockCountIds } } },
        }),
        cleanupBookId
          ? db.financeInventoryPool.count({ where: { bookId: cleanupBookId } })
          : Promise.resolve(0),
        cleanupBookId
          ? db.financeInventoryValuationEvent.count({
              where: { bookId: cleanupBookId },
            })
          : Promise.resolve(0),
        cleanupBookId
          ? db.financePurchaseReceiptLine.count({
              where: { bookId: cleanupBookId },
            })
          : Promise.resolve(0),
        cleanupBookId
          ? db.financeBill.count({ where: { bookId: cleanupBookId } })
          : Promise.resolve(0),
        cleanupBookId
          ? db.financeJournalEntry.count({ where: { bookId: cleanupBookId } })
          : Promise.resolve(0),
        cleanupBookId
          ? db.financeJournalLine.count({ where: { bookId: cleanupBookId } })
          : Promise.resolve(0),
        cleanupBookId
          ? db.financeCommand.count({ where: { bookId: cleanupBookId } })
          : Promise.resolve(0),
        db.stockOperation.count({ where: { tenantId: { in: tenantIds } } }),
        db.stockMovement.count({
          where: { operation: { tenantId: { in: tenantIds } } },
        }),
        db.stockOperationCategory.count({
          where: { tenantId: { in: tenantIds } },
        }),
        db.stockOperationCategoryName.count({
          where: { tenantId: { in: tenantIds } },
        }),
        db.stockBalanceSource.count({
          where: { id: { in: balanceSourceIds } },
        }),
      ])
      assertCleanup(remainingTenants === 0, "QA tenants remain after cleanup")
      assertCleanup(remainingStores === 0, "QA stores remain after cleanup")
      assertCleanup(
        remainingItems === 0,
        "QA Catalog Items remain after cleanup",
      )
      assertCleanup(
        remainingBooks === 0,
        "QA Finance Book remains after cleanup",
      )
      assertCleanup(
        remainingSuppliers === 0,
        "QA supplier remains after cleanup",
      )
      assertCleanup(remainingUsers === 0, "QA user remains after cleanup")
      assertCleanup(
        remainingCounts === 0,
        "QA Stock Counts remain after cleanup",
      )
      assertCleanup(
        remainingLines === 0,
        "QA Stock Count Lines remain after cleanup",
      )
      assertCleanup(
        remainingEntries === 0,
        "QA Stock Count Entries remain after cleanup",
      )
      assertCleanup(
        remainingPools === 0,
        "QA valuation pools remain after cleanup",
      )
      assertCleanup(
        remainingEvents === 0,
        "QA valuation events remain after cleanup",
      )
      assertCleanup(
        remainingReceipts === 0,
        "QA purchase receipts remain after cleanup",
      )
      assertCleanup(
        remainingBills === 0,
        "QA purchase bills remain after cleanup",
      )
      assertCleanup(
        remainingJournalEntries === 0,
        "QA journals remain after cleanup",
      )
      assertCleanup(
        remainingJournalLines === 0,
        "QA journal lines remain after cleanup",
      )
      assertCleanup(
        remainingFinanceCommands === 0,
        "QA finance commands remain after cleanup",
      )
      assertCleanup(
        remainingStockOperations === 0,
        "QA Stock Operations remain after cleanup",
      )
      assertCleanup(
        remainingStockMovements === 0,
        "QA Stock Movements remain after cleanup",
      )
      assertCleanup(
        remainingStockCategories === 0,
        "QA Stock Operation categories remain after cleanup",
      )
      assertCleanup(
        remainingCategoryNames === 0,
        "QA Stock category names remain after cleanup",
      )
      assertCleanup(
        remainingBalances === 0,
        "QA stock balances remain after cleanup",
      )
    }
  })
})
