import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  commitCatalogStockReservation,
  reserveCatalogOfferingStock,
} from "../catalog-inventory"
import {
  createCommercialOrder,
  fulfillCommercialOrderProductLine,
} from "../commercial-orders"
import { correctStockOperation } from "../inventory-operations"
import { createFinanceBook } from "./accounts"
import { recordFinancePurchase } from "./purchases"
import { createFinanceSupplier } from "./supplier-writes"

setDefaultTimeout(900_000)

describeWithServiceCommerceDatabase(
  "reservation commitment cost acceptance",
  () => {
    test("retains exact source cost, owner isolation, concurrent replay and atomic rollback", async () => {
      const { prisma: db } = await import("../../client")
      const runId = randomUUID()
      console.info(`reservation-cost QA run ${runId}`)
      const tenantIds: string[] = []
      const storeIds: string[] = []
      const itemIds: string[] = []
      const balanceIds: string[] = []
      let userId: string | undefined
      let bookId: string | undefined
      try {
        const user = await db.user.create({
          data: {
            email: `reservation-cost-${runId}@example.invalid`,
            name: "Reservation cost QA owner",
          },
        })
        userId = user.id
        async function makeTenant(label: string) {
          const tenant = await db.tenant.create({
            data: {
              name: `Reservation cost QA ${label}`,
              slug: `reservation-cost-${label}-${runId}`,
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              dataClassification: "QA",
              users: {
                create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
              },
            },
          })
          tenantIds.push(tenant.id)
          const store = await db.store.create({
            data: {
              tenantId: tenant.id,
              name: "Private reservation cost QA",
              slug: `reservation-cost-${label}-${runId}`,
              status: "ACTIVE",
            },
          })
          storeIds.push(store.id)
          return { tenant, store }
        }
        const known = await makeTenant("known")
        const noBook = await makeTenant("no-book")
        const book = await createFinanceBook(db, {
          tenantId: known.tenant.id,
          actorUserId: user.id,
          startsAt: new Date("2026-01-01T00:00:00Z"),
        })
        bookId = book.id
        const supplier = await createFinanceSupplier(db, {
          tenantId: known.tenant.id,
          actorUserId: user.id,
          bookId: book.id,
          clientCommandId: `supplier-${runId}`,
          code: `RC-${runId.slice(0, 8)}`,
          name: "Reservation QA supplier",
        })
        async function makeStock(
          target: typeof known,
          label: string,
          packaged: boolean,
          initial = "0",
        ) {
          const item = await db.catalogItem.create({
            data: {
              tenantId: target.tenant.id,
              slug: `reservation-cost-${label}-${runId}`,
              kind: "PRODUCT",
              name: `Reservation QA ${label}`,
              product: { create: {} },
              variants: {
                create: { key: "default", name: "Default", isDefault: true },
              },
            },
            include: { product: true, variants: true },
          })
          itemIds.push(item.id)
          const product = item.product
          const variant = item.variants[0]
          if (!product || !variant)
            throw new Error("Incomplete reservation Product fixture")
          const configuration = await db.unitConfigurationVersion.create({
            data: {
              productId: product.id,
              version: 1,
              status: "CURRENT",
              canonicalBalanceScale: 18,
              units: {
                create: [
                  {
                    key: "base",
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
                  {
                    key: "alternate",
                    name: "alternate case",
                    factor: "12",
                    stockBehavior: "ALTERNATE_TRANSACTION",
                    transactionScale: 3,
                  },
                ],
              },
            },
            include: { units: true },
          })
          const base = configuration.units.find((unit) => unit.key === "base")
          const entered = configuration.units.find(
            (unit) => unit.key === (packaged ? "case" : "alternate"),
          )
          if (!base || !entered) throw new Error("Missing reservation units")
          await db.catalogProduct.update({
            where: { id: product.id },
            data: { currentUnitConfigurationVersionId: configuration.id },
          })
          const balance = await db.stockBalanceSource.create({
            data: {
              tenantId: target.tenant.id,
              storeId: target.store.id,
              productId: product.id,
              variantId: variant.id,
              inventoryUnitId: packaged ? entered.id : base.id,
              kind: packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
              onHandQuantity: initial,
            },
          })
          balanceIds.push(balance.id)
          const offering = await db.sellableOffering.create({
            data: {
              tenantId: target.tenant.id,
              catalogItemId: item.id,
              variantId: variant.id,
              key: "offering",
              kind: "PRODUCT_UNIT",
              status: "ACTIVE",
              name: "Reservation QA Offering",
              pricingPolicy: "FIXED",
              fixedPriceMinor: 5000,
              currencyCode: target.tenant.currencyCode,
              productUnitOffering: {
                create: {
                  tenantId: target.tenant.id,
                  inventoryUnitId: entered.id,
                },
              },
              storeAvailability: {
                create: { storeId: target.store.id, isAvailable: true },
              },
            },
          })
          return {
            target,
            balance,
            configuration,
            offering,
            purchaseUnitId: packaged ? entered.id : base.id,
          }
        }
        const packaged = await makeStock(known, "packaged", true)
        const shared = await makeStock(known, "shared", false)
        const legacy = await makeStock(known, "legacy", true, "4")
        const physicalOnly = await makeStock(noBook, "physical", true, "4")
        async function receive(
          stock: typeof packaged,
          label: string,
          amountMinor: string,
          quantity: string,
        ) {
          await recordFinancePurchase(db, {
            tenantId: known.tenant.id,
            actorUserId: user.id,
            bookId: book.id,
            clientCommandId: `receipt-${label}-${runId}`,
            supplierId: supplier.id,
            storeId: known.store.id,
            description: "Reservation QA known cost",
            incurredAt: new Date("2026-09-15T12:00:00Z"),
            lines: [
              {
                balanceSourceId: stock.balance.id,
                enteredInventoryUnitId: stock.purchaseUnitId,
                expectedConfigurationVersionId: stock.configuration.id,
                description: "QA original cost",
                amountMinor,
                enteredQuantity: quantity,
                expectedBalanceRevision: 0,
                categories: [{ name: `Reservation ${runId.slice(0, 8)}` }],
              },
            ],
          })
        }
        await receive(packaged, "packaged", "1001", "2")
        await receive(shared, "shared", "2003", "48")
        async function reserve(
          stock: typeof packaged,
          label: string,
          quantity: string,
        ) {
          return reserveCatalogOfferingStock(db, {
            tenantId: stock.target.tenant.id,
            storeId: stock.target.store.id,
            offeringId: stock.offering.id,
            enteredQuantity: quantity,
            expectedConfigurationVersionId: stock.configuration.id,
            clientReservationId: `reserve-${label}-${runId}`,
            schemaVersion: 1,
          })
        }
        function command(
          reservationId: string,
          label: string,
          tenantId = known.tenant.id,
        ) {
          return {
            tenantId,
            actorUserId: user.id,
            reservationId,
            clientOperationId: `commit-${label}-${runId}`,
            schemaVersion: 1,
            source: "inventory",
            reason: "QA standalone commitment",
          }
        }
        const eventFor = (operationId: string) =>
          db.financeInventoryValuationEvent.findFirstOrThrow({
            where: { stockOperationId: operationId },
          })
        const originalJournalCount = await db.financeJournalEntry.count({
          where: { bookId: book.id },
        })
        const partialReservation = await reserve(packaged, "partial", "0.5")
        const firstCommand = command(partialReservation.id, "partial")
        const [first, simultaneous] = await Promise.all([
          commitCatalogStockReservation(db, firstCommand),
          commitCatalogStockReservation(db, firstCommand),
        ])
        expect(simultaneous).toEqual(first)
        const firstEvent = await eventFor(first.id)
        expect(firstEvent.kind).toBe("ISSUE")
        expect(firstEvent.sourceKind).toBe("STOCK_RESERVATION_COMMIT")
        expect(firstEvent.sourceId).toBe(partialReservation.id)
        expect(firstEvent.canonicalEffect.toFixed()).toBe("-6")
        expect(firstEvent.sourceCostMinor).toBe(BigInt(250))
        expect(firstEvent.valueAfterMinor).toBe(BigInt(751))
        const owner = await db.stockReservation.findUniqueOrThrow({
          where: { id: partialReservation.id },
          include: { committedOperation: true },
        })
        expect(owner.committedOperationId).toBe(first.id)
        expect(owner.committedAt).toEqual(
          owner.committedOperation?.effectiveAt ?? null,
        )
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { stockOperationId: first.id },
          }),
        ).toBe(1)
        expect(
          await db.financeJournalEntry.count({ where: { bookId: book.id } }),
        ).toBe(originalJournalCount)
        console.info(
          `reservation-cost ${runId}: partial cost/concurrent replay accepted`,
        )

        // The real Product source must keep its original adapter and exactly one issue.
        const order = await createCommercialOrder(db, {
          tenantId: known.tenant.id,
          storeId: known.store.id,
          actorUserId: user.id,
          clientOrderId: `order-${runId}`,
          schemaVersion: 1,
          lines: [
            {
              offeringId: packaged.offering.id,
              quantity: "0.5",
              expectedConfigurationVersionId: packaged.configuration.id,
            },
          ],
        })
        const line = await db.commercialOrderLine.findFirstOrThrow({
          where: { orderId: order.id },
          include: { stockReservation: true },
        })
        if (!line.stockReservation)
          throw new Error("Product reservation missing")
        const commerceBefore = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: packaged.balance.id },
        })
        await expect(
          commitCatalogStockReservation(
            db,
            command(line.stockReservation.id, "wrong-owner"),
          ),
        ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
        expect(
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: packaged.balance.id },
          }),
        ).toEqual(commerceBefore)
        const fulfilled = await fulfillCommercialOrderProductLine(db, {
          tenantId: known.tenant.id,
          actorUserId: user.id,
          orderLineId: line.id,
          clientOperationId: `fulfill-${runId}`,
          schemaVersion: 1,
        })
        const fulfillment = await db.productFulfillment.findFirstOrThrow({
          where: { orderLineId: line.id },
        })
        expect(fulfilled).toBeDefined()
        const productEvent = await eventFor(fulfillment.stockOperationId)
        expect(productEvent.sourceKind).toBe("PRODUCT_FULFILLMENT")
        expect(productEvent.sourceCostMinor).toBe(BigInt(250))
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { stockOperationId: fulfillment.stockOperationId },
          }),
        ).toBe(1)
        expect(
          await db.financeInventoryValuationEvent.count({
            where: {
              sourceId: line.stockReservation.id,
              sourceKind: "STOCK_RESERVATION_COMMIT",
            },
          }),
        ).toBe(0)
        const productReservation = await db.stockReservation.findUniqueOrThrow({
          where: { id: line.stockReservation.id },
        })
        expect(productReservation.committedOperationId).toBe(
          fulfillment.stockOperationId,
        )

        const fullReservation = await reserve(packaged, "residual", "1")
        const full = await commitCatalogStockReservation(
          db,
          command(fullReservation.id, "residual"),
        )
        const fullEvent = await eventFor(full.id)
        expect(fullEvent.sourceCostMinor).toBe(BigInt(501))
        expect(fullEvent.valueAfterMinor).toBe(BigInt(0))
        expect(fullEvent.quantityAfter.toFixed()).toBe("0")

        const sharedReservation = await reserve(shared, "shared", "0.5")
        const sharedCommand = command(sharedReservation.id, "shared")
        const snapshot = async () => ({
          balance: await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: shared.balance.id },
          }),
          reservation: await db.stockReservation.findUniqueOrThrow({
            where: { id: sharedReservation.id },
          }),
          pool: await db.financeInventoryPool.findUniqueOrThrow({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: shared.balance.id,
              },
            },
          }),
          operations: await db.stockOperation.count({
            where: { tenantId: known.tenant.id },
          }),
          movements: await db.stockMovement.count({
            where: { balanceSourceId: shared.balance.id },
          }),
          costs: await db.financeInventoryValuationEvent.count({
            where: { bookId: book.id },
          }),
          journals: await db.financeJournalEntry.count({
            where: { bookId: book.id },
          }),
        })
        const rollbackBefore = await snapshot()
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: new Date(Date.now() + 86_400_000) },
        })
        try {
          await expect(
            commitCatalogStockReservation(db, sharedCommand),
          ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
          expect(await snapshot()).toEqual(rollbackBefore)
          expect(await commitCatalogStockReservation(db, firstCommand)).toEqual(
            first,
          )
        } finally {
          await db.financeBook.update({
            where: { id: book.id },
            data: { closedThrough: null },
          })
        }
        const sharedIssue = await commitCatalogStockReservation(
          db,
          sharedCommand,
        )
        const sharedEvent = await eventFor(sharedIssue.id)
        expect(sharedEvent.canonicalEffect.toFixed()).toBe("-6")
        expect(sharedEvent.sourceCostMinor).toBe(BigInt(250))
        expect(sharedEvent.quantityAfter.toFixed()).toBe("42")
        expect(sharedEvent.valueAfterMinor).toBe(BigInt(1753))
        // Simulate pre-feature physical history: it must never become zero-cost stock.
        const legacyReservation = await reserve(legacy, "legacy", "0.5")
        const legacyIssue = await commitCatalogStockReservation(
          db,
          command(legacyReservation.id, "legacy"),
        )
        const legacyEvent = await eventFor(legacyIssue.id)
        expect(legacyEvent.sourceCostMinor).toBeNull()
        expect(legacyEvent.valueAfterMinor).toBeNull()
        expect(legacyEvent.unknownReason).toBe("MISSING_OPENING_COST")
        await db.financeInventoryPool.update({
          where: {
            bookId_balanceSourceId: {
              bookId: book.id,
              balanceSourceId: shared.balance.id,
            },
          },
          data: { lastMovementCount: BigInt(0) },
        })
        const gapReservation = await reserve(shared, "gap", "0.5")
        const gapIssue = await commitCatalogStockReservation(
          db,
          command(gapReservation.id, "gap"),
        )
        const gapEvent = await eventFor(gapIssue.id)
        expect(gapEvent.sourceCostMinor).toBeNull()
        expect(gapEvent.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
        console.info(
          `reservation-cost ${runId}: Product isolation/residual/rollback/UNKNOWN accepted`,
        )

        const physicalReservation = await reserve(
          physicalOnly,
          "physical",
          "0.5",
        )
        const physicalCommand = command(
          physicalReservation.id,
          "physical",
          noBook.tenant.id,
        )
        const [physical, physicalReplay] = await Promise.all([
          commitCatalogStockReservation(db, physicalCommand),
          commitCatalogStockReservation(db, physicalCommand),
        ])
        expect(physicalReplay).toEqual(physical)
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { tenantId: noBook.tenant.id },
          }),
        ).toBe(0)
        const physicalOwner = await db.stockReservation.findUniqueOrThrow({
          where: { id: physicalReservation.id },
          include: { committedOperation: true },
        })
        expect(physicalOwner.committedOperationId).toBe(physical.id)
        expect(physicalOwner.committedAt).toEqual(
          physicalOwner.committedOperation?.effectiveAt ?? null,
        )
        const physicalBalance = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: physicalOnly.balance.id },
        })
        expect(physicalBalance.onHandQuantity.toFixed()).toBe("3.5")
        expect(physicalBalance.reservedQuantity.toFixed()).toBe("0")
        const physicalMovement = await db.stockMovement.findFirstOrThrow({
          where: { operationId: physical.id },
        })
        await expect(
          correctStockOperation(db, {
            tenantId: noBook.tenant.id,
            actorUserId: user.id,
            clientOperationId: `correction-${runId}`,
            targetOperationId: physical.id,
            source: "inventory",
            reason: "QA must use owning source",
            schemaVersion: 1,
            corrections: [
              {
                movementId: physicalMovement.id,
                correctedEnteredQuantity: "0.25",
                expectedBalanceRevision: physicalBalance.revision,
              },
            ],
          }),
        ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
        expect(
          await db.stockBalanceSource.findUniqueOrThrow({
            where: { id: physicalOnly.balance.id },
          }),
        ).toEqual(physicalBalance)
        await expect(
          commitCatalogStockReservation(db, {
            ...physicalCommand,
            clientOperationId: `foreign-${runId}`,
            tenantId: known.tenant.id,
          }),
        ).rejects.toMatchObject({ code: "RESERVATION_NOT_FOUND" })
        await expect(
          Promise.resolve(
            db.stockReservation.update({
              where: { id: physicalReservation.id },
              data: { committedOperationId: first.id },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2003" })
        await expect(
          Promise.resolve(
            db.stockReservation.update({
              where: { id: legacyReservation.id },
              data: { committedOperationId: first.id },
            }),
          ),
        ).rejects.toMatchObject({ code: "P2002" })
        expect(
          (
            await db.stockReservation.findUniqueOrThrow({
              where: { id: physicalReservation.id },
            })
          ).committedOperationId,
        ).toBe(physical.id)
        expect(await commitCatalogStockReservation(db, firstCommand)).toEqual(
          first,
        )
        expect(await eventFor(first.id)).toEqual(firstEvent)
        expect(
          await db.financeJournalEntry.count({ where: { bookId: book.id } }),
        ).toBe(originalJournalCount)
      } finally {
        await db.$transaction(
          async (tx) => {
            if (bookId) {
              await tx.financeInventoryValuationEvent.deleteMany({
                where: { bookId },
              })
              await tx.financeInventoryPool.deleteMany({ where: { bookId } })
              await tx.financePurchaseReceiptLine.deleteMany({
                where: { bookId },
              })
              await tx.financeSupplierEntry.deleteMany({ where: { bookId } })
              await tx.financeBillPayment.deleteMany({ where: { bookId } })
              await tx.financeBillLine.deleteMany({ where: { bookId } })
              await tx.financeBill.deleteMany({ where: { bookId } })
            }
            if (tenantIds.length) {
              await tx.productFulfillment.deleteMany({
                where: {
                  orderLine: { order: { tenantId: { in: tenantIds } } },
                },
              })
              // The new restrictive reservation owner FK must be cleared before operations.
              await tx.stockReservation.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.commercialOrder.deleteMany({
                where: { tenantId: { in: tenantIds } },
              })
              await tx.stockMovement.deleteMany({
                where: { operation: { tenantId: { in: tenantIds } } },
              })
              await tx.stockOperationCategory.deleteMany({
                where: { stockOperation: { tenantId: { in: tenantIds } } },
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
            if (bookId) {
              await tx.financeSupplierAccount.deleteMany({ where: { bookId } })
              await tx.financeJournalLine.deleteMany({ where: { bookId } })
              await tx.financeJournalEntry.deleteMany({ where: { bookId } })
              await tx.financeCommand.deleteMany({ where: { bookId } })
              await tx.financeAccount.deleteMany({ where: { bookId } })
              await tx.financeBook.deleteMany({ where: { id: bookId } })
            }
            await tx.catalogItem.deleteMany({ where: { id: { in: itemIds } } })
            await tx.store.deleteMany({ where: { id: { in: storeIds } } })
            await tx.membership.deleteMany({
              where: { tenantId: { in: tenantIds } },
            })
            await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
            if (userId) await tx.user.deleteMany({ where: { id: userId } })
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
        const remaining = await Promise.all([
          db.tenant.count({ where: { id: { in: tenantIds } } }),
          db.store.count({ where: { id: { in: storeIds } } }),
          db.catalogItem.count({ where: { id: { in: itemIds } } }),
          db.stockBalanceSource.count({ where: { id: { in: balanceIds } } }),
          db.stockOperation.count({ where: { tenantId: { in: tenantIds } } }),
          db.stockReservation.count({ where: { tenantId: { in: tenantIds } } }),
          db.commercialOrder.count({ where: { tenantId: { in: tenantIds } } }),
          db.productFulfillment.count({
            where: { orderLine: { order: { tenantId: { in: tenantIds } } } },
          }),
          db.financeInventoryValuationEvent.count({
            where: { tenantId: { in: tenantIds } },
          }),
          db.financeInventoryPool.count({
            where: { tenantId: { in: tenantIds } },
          }),
          db.financeBook.count({ where: { tenantId: { in: tenantIds } } }),
          bookId ? db.financeJournalEntry.count({ where: { bookId } }) : 0,
          userId ? db.user.count({ where: { id: userId } }) : 0,
        ])
        for (const count of remaining) expect(count).toBe(0)
        console.info(
          `reservation-cost ${runId}: all ${remaining.length} cleanup checks clear`,
        )
      }
    })
  },
)
