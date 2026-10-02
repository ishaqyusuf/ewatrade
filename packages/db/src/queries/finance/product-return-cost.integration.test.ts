import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  createCommercialOrder,
  fulfillCommercialOrderProductLine,
  returnCommercialOrderProductLine,
} from "../commercial-orders"
import { lockCommerceFinancialOrder } from "../customer-ledger/commerce-locks"
import { createFinanceBook } from "./accounts"
import { postCommerceFinanceJournalInTransaction } from "./posting"
import { recordFinancePurchase } from "./purchases"
import { createFinanceSupplier } from "./supplier-writes"

const BOOK_START = new Date("2026-01-01T00:00:00.000Z")
const RECEIPT_DATE = new Date("2026-09-15T12:00:00.000Z")
setDefaultTimeout(480_000)

describeWithServiceCommerceDatabase("Product return cost acceptance", () => {
  test("restores original issue cost through returns, replay, and EARNED", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const tenantIds: string[] = []
    const storeIds: string[] = []
    const catalogItemIds: string[] = []
    const balanceSourceIds: string[] = []
    const orderIds: string[] = []
    const orderLineIds: string[] = []
    const reservationIds: string[] = []
    const returnIds: string[] = []
    const returnCostIds: string[] = []
    const returnAllocationIds: string[] = []
    const returnEventIds: string[] = []
    let actorUserId: string | undefined
    let bookId: string | undefined

    try {
      const user = await db.user.create({
        data: {
          email: `product-return-cost-${runId}@example.invalid`,
          name: "Product return cost QA",
        },
      })
      actorUserId = user.id
      const tenant = await db.tenant.create({
        data: {
          name: "Product return cost QA",
          slug: `product-return-cost-${runId}`,
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
      const foreignTenant = await db.tenant.create({
        data: {
          name: "Foreign Product return cost QA",
          slug: `product-return-cost-foreign-${runId}`,
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
          name: "Private Product return cost store",
          slug: `product-return-cost-${runId}`,
          status: "ACTIVE",
        },
      })
      const deferredStore = await db.store.create({
        data: {
          tenantId: tenant.id,
          name: "Private deferred Product return QA store",
          slug: `product-return-cost-deferred-${runId}`,
          status: "ACTIVE",
        },
      })
      const unknownStore = await db.store.create({
        data: {
          tenantId: tenant.id,
          name: "Private unknown Product return QA store",
          slug: `product-return-cost-unknown-${runId}`,
          status: "ACTIVE",
        },
      })
      storeIds.push(store.id, deferredStore.id, unknownStore.id)

      const item = await db.catalogItem.create({
        data: {
          tenantId: tenant.id,
          slug: `product-return-cost-${runId}`,
          kind: "PRODUCT",
          name: "Packaged return-cost QA Product",
          product: { create: {} },
          variants: {
            create: { key: "default", name: "Default", isDefault: true },
          },
        },
        include: { product: true, variants: true },
      })
      catalogItemIds.push(item.id)
      const product = item.product
      const variant = item.variants[0]
      if (!product || !variant) {
        throw new Error("Incomplete Product return cost Catalog fixture")
      }
      const productId = product.id
      const variantId = variant.id
      const configuration = await db.unitConfigurationVersion.create({
        data: {
          productId: product.id,
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
        throw new Error("Missing canonical or packaged return-cost unit")
      }
      const caseUnitId = caseUnit.id
      expect(canonicalUnit.factor.toFixed()).toBe("1")
      expect(caseUnit.factor.toFixed()).toBe("12")
      await db.catalogProduct.update({
        where: { id: product.id },
        data: { currentUnitConfigurationVersionId: configuration.id },
      })

      async function makeBalance(
        targetStore: typeof store,
        onHandQuantity: string,
      ) {
        const balance = await db.stockBalanceSource.create({
          data: {
            tenantId: tenant.id,
            storeId: targetStore.id,
            productId,
            variantId,
            inventoryUnitId: caseUnitId,
            kind: "PACKAGED_STOCK",
            onHandQuantity,
          },
        })
        balanceSourceIds.push(balance.id)
        return balance
      }
      const balance = await makeBalance(store, "0")
      const deferredBalance = await makeBalance(deferredStore, "0")
      const unknownBalance = await makeBalance(unknownStore, "5")

      const offering = await db.sellableOffering.create({
        data: {
          tenantId: tenant.id,
          catalogItemId: item.id,
          variantId: variant.id,
          key: "case",
          kind: "PRODUCT_UNIT",
          status: "ACTIVE",
          name: "Packaged return-cost QA Product case",
          pricingPolicy: "FIXED",
          fixedPriceMinor: 5000,
          currencyCode: tenant.currencyCode,
          productUnitOffering: {
            create: { tenantId: tenant.id, inventoryUnitId: caseUnit.id },
          },
          storeAvailability: {
            create: [
              { storeId: store.id, isAvailable: true },
              { storeId: deferredStore.id, isAvailable: true },
              { storeId: unknownStore.id, isAvailable: true },
            ],
          },
        },
      })

      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: BOOK_START,
      })
      bookId = book.id
      const supplier = await createFinanceSupplier(db, {
        ...actor,
        bookId: book.id,
        clientCommandId: `product-return-cost-supplier-${runId}`,
        code: `PRC-${runId.slice(0, 8)}`,
        name: "Product return cost QA supplier",
      })

      async function receive(
        label: string,
        targetStore: typeof store,
        targetBalance: typeof balance,
        quantity: string,
        amountMinor: string,
        expectedBalanceRevision: number,
        incurredAt = RECEIPT_DATE,
      ) {
        await recordFinancePurchase(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `product-return-cost-${label}-${runId}`,
          supplierId: supplier.id,
          storeId: targetStore.id,
          description: `Known packaged ${label} receipt`,
          incurredAt,
          lines: [
            {
              balanceSourceId: targetBalance.id,
              enteredInventoryUnitId: caseUnitId,
              expectedConfigurationVersionId: configuration.id,
              description: `${quantity} QA cases with known cost`,
              amountMinor,
              enteredQuantity: quantity,
              expectedBalanceRevision,
              categories: [{ name: `PRC ${runId.slice(0, 8)}` }],
            },
          ],
        })
      }
      await receive("original", store, balance, "2", "1001", 0)
      await receive("deferred", deferredStore, deferredBalance, "1", "1000", 0)

      async function makeOrder(
        label: string,
        quantity: string,
        targetStore: typeof store,
        targetBalance: typeof balance,
      ) {
        const currentBalance = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: targetBalance.id },
        })
        const order = await createCommercialOrder(db, {
          actorUserId: user.id,
          clientOrderId: `product-return-cost-${label}-${runId}`,
          schemaVersion: 1,
          storeId: targetStore.id,
          tenantId: tenant.id,
          lines: [
            {
              offeringId: offering.id,
              quantity,
              expectedBalanceRevision: currentBalance.revision,
              expectedConfigurationVersionId: configuration.id,
            },
          ],
        })
        const line = await db.commercialOrderLine.findFirstOrThrow({
          where: { orderId: order.id },
          include: { stockReservation: true },
        })
        orderIds.push(order.id)
        orderLineIds.push(line.id)
        if (line.stockReservation) reservationIds.push(line.stockReservation.id)
        return { order, line }
      }
      async function fulfill(label: string, line: { id: string }) {
        return fulfillCommercialOrderProductLine(db, {
          actorUserId: user.id,
          clientOperationId: `product-return-cost-fulfill-${label}-${runId}`,
          orderLineId: line.id,
          schemaVersion: 1,
          tenantId: tenant.id,
        })
      }
      async function post(orderId: string, event: "BILLED" | "EARNED") {
        return db.$transaction(
          async (tx) => {
            const source = { tenantId: tenant.id, orderId }
            if (!(await lockCommerceFinancialOrder(tx, source))) {
              throw new Error("QA Commerce Order disappeared before posting")
            }
            return postCommerceFinanceJournalInTransaction(tx, {
              tenantId: tenant.id,
              orderId,
              event,
            })
          },
          { maxWait: 10_000, timeout: 30_000 },
        )
      }
      async function returnLine(
        label: string,
        orderLineId: string,
        quantity: string,
        disposition: "damaged" | "no_restock" | "quarantine" | "restock",
      ) {
        const returned = await returnCommercialOrderProductLine(db, {
          actorUserId: user.id,
          clientReturnId: `product-return-cost-${label}-${runId}`,
          disposition,
          orderLineId,
          quantity,
          reason: `QA ${label} return`,
          schemaVersion: 1,
          tenantId: tenant.id,
        })
        returnIds.push(returned.id)
        return returned
      }
      const mainPool = () =>
        db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId: book.id,
              balanceSourceId: balance.id,
            },
          },
        })
      const deferredPool = () =>
        db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId: book.id,
              balanceSourceId: deferredBalance.id,
            },
          },
        })

      // Sell the entire first receipt, retain its full issue cost, then alter
      // the empty pool with a later receipt before recording either return.
      const original = await makeOrder("original-sale", "2", store, balance)
      await fulfill("original-sale", original.line)
      const originalIssue =
        await db.financeInventoryValuationEvent.findFirstOrThrow({
          where: {
            bookId: book.id,
            balanceSourceId: balance.id,
            kind: "ISSUE",
          },
        })
      expect(originalIssue.canonicalEffect.toFixed()).toBe("-24")
      expect(originalIssue.sourceCostMinor).toBe(BigInt(1001))
      expect((await mainPool()).quantity.toFixed()).toBe("0")
      expect((await mainPool()).valueMinor).toBe(BigInt(0))
      await post(original.order.id, "BILLED")
      await post(original.order.id, "EARNED")
      const originalCogs = await db.financeJournalEntry.findUniqueOrThrow({
        where: {
          bookId_sourceKind_sourceId: {
            bookId: book.id,
            sourceKind: "COMMERCIAL_ORDER_COGS",
            sourceId: original.order.id,
          },
        },
        include: { lines: { include: { account: true } } },
      })
      expect(
        originalCogs.lines.find((line) => line.account.code === "5000")
          ?.debitMinor,
      ).toBe(BigInt(1001))
      expect(
        originalCogs.lines.find((line) => line.account.code === "1300")
          ?.creditMinor,
      ).toBe(BigInt(1001))

      const beforeLaterReceipt = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: balance.id },
      })
      await receive(
        "later",
        store,
        balance,
        "1",
        "900",
        beforeLaterReceipt.revision,
        new Date(Math.max(Date.now(), originalIssue.effectiveAt.getTime())),
      )
      expect((await mainPool()).quantity.toFixed()).toBe("12")
      expect((await mainPool()).valueMinor).toBe(BigInt(900))

      const firstReturn = await returnLine(
        "original-half",
        original.line.id,
        "0.5",
        "restock",
      )
      const firstReturnCost =
        await db.financeProductReturnCost.findUniqueOrThrow({
          where: { productReturnId: firstReturn.id },
          include: { allocations: true },
        })
      returnCostIds.push(firstReturnCost.id)
      returnAllocationIds.push(
        ...firstReturnCost.allocations.map(({ id }) => id),
      )
      expect(firstReturnCost.canonicalQuantity.toFixed()).toBe("6")
      expect(firstReturnCost.sourceCostMinor).toBe(BigInt(250))
      expect(firstReturnCost.allocations).toHaveLength(1)
      expect(firstReturnCost.allocations[0]?.originalIssueId).toBe(
        originalIssue.id,
      )
      expect(firstReturnCost.allocations[0]?.sourceCostMinor).toBe(BigInt(250))
      const firstReturnEvent =
        await db.financeInventoryValuationEvent.findUniqueOrThrow({
          where: { productReturnCostId: firstReturnCost.id },
        })
      returnEventIds.push(firstReturnEvent.id)
      expect(firstReturnEvent.kind).toBe("CUSTOMER_RETURN")
      expect(firstReturnEvent.canonicalEffect.toFixed()).toBe("6")
      expect(firstReturnEvent.sourceCostMinor).toBe(BigInt(250))
      expect(firstReturnEvent.valueAfterMinor).toBe(BigInt(1150))
      const firstReturnJournal = await db.financeJournalEntry.findUniqueOrThrow(
        {
          where: {
            bookId_sourceKind_sourceId: {
              bookId: book.id,
              sourceKind: "PRODUCT_RETURN_COGS",
              sourceId: firstReturn.id,
            },
          },
          include: { lines: { include: { account: true } } },
        },
      )
      expect(
        firstReturnJournal.lines.find((line) => line.account.code === "1300")
          ?.debitMinor,
      ).toBe(BigInt(250))
      expect(
        firstReturnJournal.lines.find((line) => line.account.code === "5000")
          ?.creditMinor,
      ).toBe(BigInt(250))

      // Exact replay after the intervening receipt must return the same header
      // and leave its cost allocation, event, and adjustment journal untouched.
      const replaySnapshot = {
        header: firstReturnCost,
        event: firstReturnEvent,
        journal: firstReturnJournal,
        returnCount: await db.productReturn.count({
          where: { orderLineId: original.line.id },
        }),
      }
      const replayedReturn = await returnCommercialOrderProductLine(db, {
        actorUserId: user.id,
        clientReturnId: `product-return-cost-original-half-${runId}`,
        disposition: "restock",
        orderLineId: original.line.id,
        quantity: "0.5",
        reason: "QA original-half return",
        schemaVersion: 1,
        tenantId: tenant.id,
      })
      expect(replayedReturn).toEqual(firstReturn)
      expect(
        await db.financeProductReturnCost.findUniqueOrThrow({
          where: { productReturnId: firstReturn.id },
          include: { allocations: true },
        }),
      ).toEqual(replaySnapshot.header)
      expect(
        await db.financeInventoryValuationEvent.findUniqueOrThrow({
          where: { productReturnCostId: firstReturnCost.id },
        }),
      ).toEqual(replaySnapshot.event)
      expect(
        await db.financeJournalEntry.findUniqueOrThrow({
          where: {
            bookId_sourceKind_sourceId: {
              bookId: book.id,
              sourceKind: "PRODUCT_RETURN_COGS",
              sourceId: firstReturn.id,
            },
          },
          include: { lines: { include: { account: true } } },
        }),
      ).toEqual(replaySnapshot.journal)
      expect(
        await db.productReturn.count({
          where: { orderLineId: original.line.id },
        }),
      ).toBe(replaySnapshot.returnCount)

      const secondReturn = await returnLine(
        "original-remainder",
        original.line.id,
        "1.5",
        "restock",
      )
      const secondReturnCost =
        await db.financeProductReturnCost.findUniqueOrThrow({
          where: { productReturnId: secondReturn.id },
          include: { allocations: true },
        })
      returnCostIds.push(secondReturnCost.id)
      returnAllocationIds.push(
        ...secondReturnCost.allocations.map(({ id }) => id),
      )
      expect(secondReturnCost.canonicalQuantity.toFixed()).toBe("18")
      expect(secondReturnCost.sourceCostMinor).toBe(BigInt(751))
      expect(secondReturnCost.allocations[0]?.sourceCostMinor).toBe(BigInt(751))
      const secondReturnEvent =
        await db.financeInventoryValuationEvent.findUniqueOrThrow({
          where: { productReturnCostId: secondReturnCost.id },
        })
      returnEventIds.push(secondReturnEvent.id)
      expect(secondReturnEvent.canonicalEffect.toFixed()).toBe("18")
      expect(secondReturnEvent.valueDeltaMinor).toBe(BigInt(751))
      expect(secondReturnEvent.valueAfterMinor).toBe(BigInt(1901))
      const finalMainPool = await mainPool()
      expect(finalMainPool.quantity.toFixed()).toBe("36")
      expect(finalMainPool.valueMinor).toBe(BigInt(1901))
      expect(finalMainPool.unknownReason).toBeNull()
      const returnJournals = await db.financeJournalEntry.findMany({
        where: {
          bookId: book.id,
          sourceKind: "PRODUCT_RETURN_COGS",
          sourceId: { in: [firstReturn.id, secondReturn.id] },
        },
        include: { lines: { include: { account: true } } },
      })
      expect(returnJournals).toHaveLength(2)
      const returnedInventory = returnJournals.reduce((total, entry) => {
        const line = entry.lines.find(
          (entryLine) => entryLine.account.code === "1300",
        )
        return total + (line?.debitMinor ?? BigInt(0))
      }, BigInt(0))
      const returnedCogs = returnJournals.reduce((total, entry) => {
        const line = entry.lines.find(
          (entryLine) => entryLine.account.code === "5000",
        )
        return total + (line?.creditMinor ?? BigInt(0))
      }, BigInt(0))
      expect(returnedInventory).toBe(BigInt(1001))
      expect(returnedCogs).toBe(BigInt(1001))
      const originalCostDebit = originalCogs.lines.find(
        (line) => line.account.code === "5000",
      )?.debitMinor
      if (originalCostDebit === undefined)
        throw new Error("Missing original COGS debit")
      expect(originalCostDebit - returnedCogs).toBe(BigInt(0))
      const mainCogsEntries = await db.financeJournalEntry.findMany({
        where: {
          bookId: book.id,
          sourceKind: "COMMERCIAL_ORDER_COGS",
          sourceId: original.order.id,
        },
      })
      expect(mainCogsEntries).toHaveLength(1)
      expect(
        await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: "PRODUCT_RETURN_COGS",
            sourceId: firstReturn.id,
          },
        }),
      ).toBe(1)

      const overreturnSnapshot = {
        pool: await mainPool(),
        balance: await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: balance.id },
        }),
        returns: await db.productReturn.findMany({
          where: { orderLineId: original.line.id },
          orderBy: { createdAt: "asc" },
        }),
        returnCosts: await db.financeProductReturnCost.findMany({
          where: { orderLineId: original.line.id },
          include: { allocations: true },
        }),
        events: await db.financeInventoryValuationEvent.findMany({
          where: { bookId: book.id, balanceSourceId: balance.id },
          orderBy: { sequence: "asc" },
        }),
        returnJournals: await db.financeJournalEntry.findMany({
          where: {
            bookId: book.id,
            sourceKind: "PRODUCT_RETURN_COGS",
            sourceId: { in: [firstReturn.id, secondReturn.id] },
          },
          include: { lines: { include: { account: true } } },
        }),
      }
      await expect(
        returnCommercialOrderProductLine(db, {
          actorUserId: user.id,
          clientReturnId: `product-return-cost-overreturn-${runId}`,
          disposition: "restock",
          orderLineId: original.line.id,
          quantity: "0.1",
          reason: "QA overreturn",
          schemaVersion: 1,
          tenantId: tenant.id,
        }),
      ).rejects.toMatchObject({ code: "INVALID_ORDER" })
      expect({
        pool: await mainPool(),
        balance: await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: balance.id },
        }),
        returns: await db.productReturn.findMany({
          where: { orderLineId: original.line.id },
          orderBy: { createdAt: "asc" },
        }),
        returnCosts: await db.financeProductReturnCost.findMany({
          where: { orderLineId: original.line.id },
          include: { allocations: true },
        }),
        events: await db.financeInventoryValuationEvent.findMany({
          where: { bookId: book.id, balanceSourceId: balance.id },
          orderBy: { sequence: "asc" },
        }),
        returnJournals: await db.financeJournalEntry.findMany({
          where: {
            bookId: book.id,
            sourceKind: "PRODUCT_RETURN_COGS",
            sourceId: { in: [firstReturn.id, secondReturn.id] },
          },
          include: { lines: { include: { account: true } } },
        }),
      }).toEqual(overreturnSnapshot)

      const closedPeriodSale = await makeOrder(
        "closed-period-sale",
        "0.5",
        store,
        balance,
      )
      await fulfill("closed-period-sale", closedPeriodSale.line)
      await post(closedPeriodSale.order.id, "BILLED")
      await post(closedPeriodSale.order.id, "EARNED")
      const beforeClosedReturn = {
        balance: await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: balance.id },
        }),
        pool: await mainPool(),
        returnCount: await db.productReturn.count({
          where: { orderLineId: closedPeriodSale.line.id },
        }),
        returnCostCount: await db.financeProductReturnCost.count({
          where: { orderLineId: closedPeriodSale.line.id },
        }),
        returnEventCount: await db.financeInventoryValuationEvent.count({
          where: {
            bookId: book.id,
            balanceSourceId: balance.id,
            kind: "CUSTOMER_RETURN",
          },
        }),
        returnJournalCount: await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: "PRODUCT_RETURN_COGS",
          },
        }),
      }
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: new Date(Date.now() + 60_000) },
      })
      await expect(
        returnCommercialOrderProductLine(db, {
          actorUserId: user.id,
          clientReturnId: `product-return-cost-closed-${runId}`,
          disposition: "restock",
          orderLineId: closedPeriodSale.line.id,
          quantity: "0.1",
          reason: "QA closed period return",
          schemaVersion: 1,
          tenantId: tenant.id,
        }),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect({
        balance: await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: balance.id },
        }),
        pool: await mainPool(),
        returnCount: await db.productReturn.count({
          where: { orderLineId: closedPeriodSale.line.id },
        }),
        returnCostCount: await db.financeProductReturnCost.count({
          where: { orderLineId: closedPeriodSale.line.id },
        }),
        returnEventCount: await db.financeInventoryValuationEvent.count({
          where: {
            bookId: book.id,
            balanceSourceId: balance.id,
            kind: "CUSTOMER_RETURN",
          },
        }),
        returnJournalCount: await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: "PRODUCT_RETURN_COGS",
          },
        }),
      }).toEqual(beforeClosedReturn)
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: null },
      })

      const beforeForeignReturn = {
        balance: await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: balance.id },
        }),
        pool: await mainPool(),
        returnCount: await db.productReturn.count({
          where: { orderLineId: original.line.id },
        }),
        returnCostCount: await db.financeProductReturnCost.count({
          where: { orderLineId: original.line.id },
        }),
      }
      await expect(
        returnCommercialOrderProductLine(db, {
          actorUserId: user.id,
          clientReturnId: `product-return-cost-foreign-${runId}`,
          disposition: "restock",
          orderLineId: original.line.id,
          quantity: "0.1",
          reason: "QA foreign tenant return",
          schemaVersion: 1,
          tenantId: foreignTenant.id,
        }),
      ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" })
      expect({
        balance: await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: balance.id },
        }),
        pool: await mainPool(),
        returnCount: await db.productReturn.count({
          where: { orderLineId: original.line.id },
        }),
        returnCostCount: await db.financeProductReturnCost.count({
          where: { orderLineId: original.line.id },
        }),
      }).toEqual(beforeForeignReturn)

      // A return saved before explicit EARNED keeps its original issue COGS;
      // EARNED then composes gross COGS with the saved restock adjustment.
      const deferred = await makeOrder(
        "deferred-sale",
        "0.5",
        deferredStore,
        deferredBalance,
      )
      await fulfill("deferred-sale", deferred.line)
      await post(deferred.order.id, "BILLED")
      const deferredIssue =
        await db.financeInventoryValuationEvent.findFirstOrThrow({
          where: {
            bookId: book.id,
            balanceSourceId: deferredBalance.id,
            kind: "ISSUE",
          },
        })
      expect(deferredIssue.sourceCostMinor).toBe(BigInt(500))
      const earlyRestock = await returnLine(
        "deferred-restock",
        deferred.line.id,
        "0.25",
        "restock",
      )
      const earlyRestockCost =
        await db.financeProductReturnCost.findUniqueOrThrow({
          where: { productReturnId: earlyRestock.id },
          include: { allocations: true },
        })
      returnCostIds.push(earlyRestockCost.id)
      returnAllocationIds.push(
        ...earlyRestockCost.allocations.map(({ id }) => id),
      )
      expect(earlyRestockCost.sourceCostMinor).toBe(BigInt(250))
      expect(
        await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: "PRODUCT_RETURN_COGS",
            sourceId: earlyRestock.id,
          },
        }),
      ).toBe(0)
      const earlyRestockEvent =
        await db.financeInventoryValuationEvent.findUniqueOrThrow({
          where: { productReturnCostId: earlyRestockCost.id },
        })
      returnEventIds.push(earlyRestockEvent.id)

      const damaged = await returnLine(
        "deferred-damaged",
        deferred.line.id,
        "0.25",
        "damaged",
      )
      const damagedCost = await db.financeProductReturnCost.findUniqueOrThrow({
        where: { productReturnId: damaged.id },
        include: { allocations: true },
      })
      returnCostIds.push(damagedCost.id)
      returnAllocationIds.push(...damagedCost.allocations.map(({ id }) => id))
      expect(damagedCost.sourceCostMinor).toBe(BigInt(250))
      expect(damagedCost.allocations[0]?.originalIssueId).toBe(deferredIssue.id)
      expect(damagedCost.allocations[0]?.sourceCostMinor).toBe(BigInt(250))
      expect(damaged.stockOperationId).toBeNull()
      expect(
        await db.stockMovement.count({
          where: {
            operation: { clientOperationId: `${damaged.clientReturnId}:stock` },
          },
        }),
      ).toBe(0)
      expect(
        await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: "PRODUCT_RETURN_COGS",
            sourceId: damaged.id,
          },
        }),
      ).toBe(0)
      await post(deferred.order.id, "EARNED")
      const deferredCogs = await db.financeJournalEntry.findUniqueOrThrow({
        where: {
          bookId_sourceKind_sourceId: {
            bookId: book.id,
            sourceKind: "COMMERCIAL_ORDER_COGS",
            sourceId: deferred.order.id,
          },
        },
        include: { lines: { include: { account: true } } },
      })
      expect(
        deferredCogs.lines.find((line) => line.account.code === "5000")
          ?.debitMinor,
      ).toBe(BigInt(500))
      expect(
        deferredCogs.lines.find((line) => line.account.code === "1300")
          ?.creditMinor,
      ).toBe(BigInt(500))
      const deferredReturnJournal =
        await db.financeJournalEntry.findUniqueOrThrow({
          where: {
            bookId_sourceKind_sourceId: {
              bookId: book.id,
              sourceKind: "PRODUCT_RETURN_COGS",
              sourceId: earlyRestock.id,
            },
          },
          include: { lines: { include: { account: true } } },
        })
      expect(
        deferredReturnJournal.lines.find((line) => line.account.code === "1300")
          ?.debitMinor,
      ).toBe(BigInt(250))
      expect(
        await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: "PRODUCT_RETURN_COGS",
            sourceId: damaged.id,
          },
        }),
      ).toBe(0)
      expect((await deferredPool()).quantity.toFixed()).toBe("9")
      expect((await deferredPool()).valueMinor).toBe(BigInt(750))

      // Legacy positive stock with no known opening value remains UNKNOWN as
      // it is issued and returned, without an invented cost or journal.
      const unknownOrder = await makeOrder(
        "unknown-sale",
        "0.5",
        unknownStore,
        unknownBalance,
      )
      await fulfill("unknown-sale", unknownOrder.line)
      const unknownIssue =
        await db.financeInventoryValuationEvent.findFirstOrThrow({
          where: {
            bookId: book.id,
            balanceSourceId: unknownBalance.id,
            kind: "ISSUE",
          },
        })
      expect(unknownIssue.sourceCostMinor).toBeNull()
      expect(unknownIssue.unknownReason).toBe("MISSING_OPENING_COST")
      await post(unknownOrder.order.id, "BILLED")
      await post(unknownOrder.order.id, "EARNED")
      expect(
        await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: "COMMERCIAL_ORDER_COGS",
            sourceId: unknownOrder.order.id,
          },
        }),
      ).toBe(0)
      const unknownReturn = await returnLine(
        "unknown-restock",
        unknownOrder.line.id,
        "0.5",
        "restock",
      )
      const unknownReturnCost =
        await db.financeProductReturnCost.findUniqueOrThrow({
          where: { productReturnId: unknownReturn.id },
          include: { allocations: true },
        })
      returnCostIds.push(unknownReturnCost.id)
      returnAllocationIds.push(
        ...unknownReturnCost.allocations.map(({ id }) => id),
      )
      expect(unknownReturnCost.canonicalQuantity.toFixed()).toBe("6")
      expect(unknownReturnCost.sourceCostMinor).toBeNull()
      expect(unknownReturnCost.unknownReason).toBe("MISSING_OPENING_COST")
      expect(unknownReturnCost.allocations[0]?.sourceCostMinor).toBeNull()
      expect(unknownReturnCost.allocations[0]?.unknownReason).toBe(
        "MISSING_OPENING_COST",
      )
      const unknownReturnEvent =
        await db.financeInventoryValuationEvent.findUniqueOrThrow({
          where: { productReturnCostId: unknownReturnCost.id },
        })
      returnEventIds.push(unknownReturnEvent.id)
      expect(unknownReturnEvent.kind).toBe("CUSTOMER_RETURN")
      expect(unknownReturnEvent.valueAfterMinor).toBeNull()
      expect(unknownReturnEvent.unknownReason).toBe("MISSING_OPENING_COST")
      expect(
        await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: "PRODUCT_RETURN_COGS",
            sourceId: unknownReturn.id,
          },
        }),
      ).toBe(0)
      const unknownPool = await db.financeInventoryPool.findUniqueOrThrow({
        where: {
          bookId_balanceSourceId: {
            bookId: book.id,
            balanceSourceId: unknownBalance.id,
          },
        },
      })
      expect(unknownPool.quantity.toFixed()).toBe("60")
      expect(unknownPool.valueMinor).toBeNull()
      expect(unknownPool.unknownReason).toBe("MISSING_OPENING_COST")
    } finally {
      await db.$transaction(
        async (tx) => {
          if (bookId) {
            await tx.financeProductReturnCostAllocation.deleteMany({
              where: { bookId },
            })
            await tx.financeInventoryValuationEvent.deleteMany({
              where: { bookId },
            })
            await tx.financeProductReturnCost.deleteMany({
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
            await tx.productReturn.deleteMany({
              where: { tenantId: { in: tenantIds } },
            })
            await tx.productFulfillment.deleteMany({
              where: { orderLine: { order: { tenantId: { in: tenantIds } } } },
            })
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
          if (bookId) {
            await tx.financeSupplierAccount.deleteMany({ where: { bookId } })
            await tx.financeJournalLine.deleteMany({ where: { bookId } })
            await tx.financeJournalEntry.deleteMany({ where: { bookId } })
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.deleteMany({ where: { id: bookId } })
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
              where: { tenantId: { in: tenantIds }, userId: actorUserId },
            })
            await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
          }
          if (actorUserId) {
            await tx.user.deleteMany({ where: { id: actorUserId } })
          }
        },
        { maxWait: 10_000, timeout: 30_000 },
      )

      const [
        remainingTenants,
        remainingStores,
        remainingItems,
        remainingBook,
        remainingBalances,
        remainingOrders,
        remainingLines,
        remainingReservations,
        remainingReturns,
        remainingReturnCosts,
        remainingReturnAllocations,
        remainingReturnEvents,
        remainingUsers,
      ] = await Promise.all([
        db.tenant.count({ where: { id: { in: tenantIds } } }),
        db.store.count({ where: { id: { in: storeIds } } }),
        db.catalogItem.count({ where: { id: { in: catalogItemIds } } }),
        bookId ? db.financeBook.count({ where: { id: bookId } }) : 0,
        db.stockBalanceSource.count({
          where: { id: { in: balanceSourceIds } },
        }),
        db.commercialOrder.count({ where: { id: { in: orderIds } } }),
        db.commercialOrderLine.count({ where: { id: { in: orderLineIds } } }),
        db.stockReservation.count({ where: { id: { in: reservationIds } } }),
        db.productReturn.count({ where: { id: { in: returnIds } } }),
        db.financeProductReturnCost.count({
          where: { id: { in: returnCostIds } },
        }),
        db.financeProductReturnCostAllocation.count({
          where: { id: { in: returnAllocationIds } },
        }),
        db.financeInventoryValuationEvent.count({
          where: { id: { in: returnEventIds } },
        }),
        actorUserId ? db.user.count({ where: { id: actorUserId } }) : 0,
      ])
      expect({
        tenants: remainingTenants,
        stores: remainingStores,
        items: remainingItems,
        book: remainingBook,
        balances: remainingBalances,
        orders: remainingOrders,
        lines: remainingLines,
        reservations: remainingReservations,
        returns: remainingReturns,
        returnCosts: remainingReturnCosts,
        returnAllocations: remainingReturnAllocations,
        returnEvents: remainingReturnEvents,
        users: remainingUsers,
      }).toEqual({
        tenants: 0,
        stores: 0,
        items: 0,
        book: 0,
        balances: 0,
        orders: 0,
        lines: 0,
        reservations: 0,
        returns: 0,
        returnCosts: 0,
        returnAllocations: 0,
        returnEvents: 0,
        users: 0,
      })
    }
  })
})
