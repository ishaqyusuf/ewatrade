import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  createCommercialOrder,
  fulfillCommercialOrderProductLine,
} from "../commercial-orders"
import { createFinanceBook } from "./accounts"
import { postCommerceFinanceJournalInTransaction } from "./posting"
import { recordFinancePurchase } from "./purchases"
import { getFinanceAccountBalances } from "./reads"
import { createFinanceSupplier } from "./supplier-writes"

const BOOK_START = new Date("2026-01-01T00:00:00.000Z")
const RECEIPT_DATE = new Date("2026-09-15T12:00:00.000Z")
setDefaultTimeout(300_000)

describeWithServiceCommerceDatabase("Product issue COGS acceptance", () => {
  test("values packaged Product issues and posts retained COGS atomically with EARNED", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    const tenantIds: string[] = []
    const storeIds: string[] = []
    const catalogItemIds: string[] = []
    const balanceSourceIds: string[] = []
    const orderIds: string[] = []
    const orderLineIds: string[] = []
    const reservationIds: string[] = []
    let actorUserId: string | undefined
    let bookId: string | undefined

    try {
      const user = await db.user.create({
        data: {
          email: `product-issue-cogs-${runId}@example.invalid`,
          name: "Product issue COGS QA",
        },
      })
      actorUserId = user.id
      const tenant = await db.tenant.create({
        data: {
          name: "Product issue COGS QA",
          slug: `product-issue-cogs-${runId}`,
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
          name: "Foreign Product issue COGS QA",
          slug: `product-issue-cogs-foreign-${runId}`,
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
          name: "Private Product issue COGS store",
          slug: `product-issue-cogs-${runId}`,
          status: "ACTIVE",
        },
      })
      storeIds.push(store.id)
      const unknownStore = await db.store.create({
        data: {
          tenantId: tenant.id,
          name: "Private unknown-opening QA store",
          slug: `product-issue-cogs-unknown-${runId}`,
          status: "ACTIVE",
        },
      })
      storeIds.push(unknownStore.id)

      const item = await db.catalogItem.create({
        data: {
          tenantId: tenant.id,
          slug: `product-issue-cogs-${runId}`,
          kind: "PRODUCT",
          name: "Packaged QA Product",
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
        throw new Error("Incomplete Product issue COGS Catalog fixture")
      }
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
        throw new Error("Missing canonical or packaged inventory unit")
      }
      expect(canonicalUnit.factor.toFixed()).toBe("1")
      expect(caseUnit.factor.toFixed()).toBe("12")
      await db.catalogProduct.update({
        where: { id: product.id },
        data: { currentUnitConfigurationVersionId: configuration.id },
      })
      const balance = await db.stockBalanceSource.create({
        data: {
          tenantId: tenant.id,
          storeId: store.id,
          productId: product.id,
          variantId: variant.id,
          inventoryUnitId: caseUnit.id,
          kind: "PACKAGED_STOCK",
          onHandQuantity: "0",
        },
      })
      balanceSourceIds.push(balance.id)
      const unknownBalance = await db.stockBalanceSource.create({
        data: {
          tenantId: tenant.id,
          storeId: unknownStore.id,
          productId: product.id,
          variantId: variant.id,
          inventoryUnitId: caseUnit.id,
          kind: "PACKAGED_STOCK",
          onHandQuantity: "5",
        },
      })
      balanceSourceIds.push(unknownBalance.id)

      const offering = await db.sellableOffering.create({
        data: {
          tenantId: tenant.id,
          catalogItemId: item.id,
          variantId: variant.id,
          key: "case",
          kind: "PRODUCT_UNIT",
          status: "ACTIVE",
          name: "Packaged QA Product case",
          pricingPolicy: "FIXED",
          fixedPriceMinor: 5000,
          currencyCode: tenant.currencyCode,
          productUnitOffering: {
            create: { tenantId: tenant.id, inventoryUnitId: caseUnit.id },
          },
          storeAvailability: {
            create: { storeId: store.id, isAvailable: true },
          },
        },
      })
      await db.storeOfferingAvailability.create({
        data: { storeId: unknownStore.id, offeringId: offering.id },
      })
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: BOOK_START,
      })
      bookId = book.id
      const supplier = await createFinanceSupplier(db, {
        ...actor,
        bookId: book.id,
        clientCommandId: `product-issue-cogs-supplier-${runId}`,
        code: `COGS-${runId.slice(0, 8)}`,
        name: "Product issue COGS QA supplier",
      })
      await recordFinancePurchase(db, {
        ...actor,
        bookId: book.id,
        clientCommandId: `product-issue-cogs-opening-${runId}`,
        supplierId: supplier.id,
        storeId: store.id,
        description: "Known packaged stock receipt",
        incurredAt: RECEIPT_DATE,
        lines: [
          {
            balanceSourceId: balance.id,
            enteredInventoryUnitId: caseUnit.id,
            expectedConfigurationVersionId: configuration.id,
            description: "Two QA cases with known cost",
            amountMinor: "1001",
            enteredQuantity: "2",
            expectedBalanceRevision: 0,
            categories: [{ name: `COGS ${runId.slice(0, 8)}` }],
          },
        ],
      })
      const pool = () =>
        db.financeInventoryPool.findUniqueOrThrow({
          where: {
            bookId_balanceSourceId: {
              bookId: book.id,
              balanceSourceId: balance.id,
            },
          },
        })
      const initialPool = await pool()
      expect(initialPool.quantity.toFixed()).toBe("24")
      expect(initialPool.valueMinor).toBe(BigInt(1001))
      expect(initialPool.unknownReason).toBeNull()

      async function makeOrder(
        label: string,
        quantity: string,
        orderStoreId = store.id,
        sourceBalanceId = balance.id,
      ) {
        const currentBalance = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: sourceBalanceId },
        })
        const order = await createCommercialOrder(db, {
          actorUserId: user.id,
          clientOrderId: `product-issue-cogs-${label}-${runId}`,
          schemaVersion: 1,
          storeId: orderStoreId,
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
      const first = await makeOrder("first-sale", "0.5")

      const fulfillmentInput = {
        actorUserId: user.id,
        clientOperationId: `product-issue-cogs-fulfill-first-${runId}`,
        orderLineId: first.line.id,
        schemaVersion: 1,
        tenantId: tenant.id,
      }
      const firstReservation = first.line.stockReservation
      if (!firstReservation) {
        throw new Error("First Product Order line has no stock reservation")
      }
      const beforeIssue = async () => {
        const currentBalance = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id: balance.id },
        })
        const currentReservation = await db.stockReservation.findUniqueOrThrow({
          where: { id: firstReservation.id },
        })
        return {
          balance: {
            onHandQuantity: currentBalance.onHandQuantity.toFixed(),
            reservedQuantity: currentBalance.reservedQuantity.toFixed(),
            revision: currentBalance.revision,
          },
          reservation: {
            status: currentReservation.status,
            committedAt: currentReservation.committedAt,
          },
          fulfillments: await db.productFulfillment.count({
            where: { orderLineId: first.line.id },
          }),
          issueEvents: await db.financeInventoryValuationEvent.count({
            where: { bookId: book.id, kind: "ISSUE" },
          }),
          pool: await db.financeInventoryPool.findUnique({
            where: {
              bookId_balanceSourceId: {
                bookId: book.id,
                balanceSourceId: balance.id,
              },
            },
          }),
          movementCount: await db.stockMovement.count({
            where: { balanceSourceId: balance.id },
          }),
          operations: await db.stockOperation.count({
            where: { tenantId: tenant.id },
          }),
        }
      }

      const beforeClosedIssue = await beforeIssue()
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: new Date(Date.now() + 60_000) },
      })
      await expect(
        fulfillCommercialOrderProductLine(db, fulfillmentInput),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect(await beforeIssue()).toEqual(beforeClosedIssue)
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: null },
      })

      await expect(
        fulfillCommercialOrderProductLine(db, {
          ...fulfillmentInput,
          tenantId: foreignTenant.id,
        }),
      ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" })
      expect(await beforeIssue()).toEqual(beforeClosedIssue)

      const firstFulfillment = await fulfillCommercialOrderProductLine(
        db,
        fulfillmentInput,
      )
      const firstIssue =
        await db.financeInventoryValuationEvent.findFirstOrThrow({
          where: {
            bookId: book.id,
            balanceSourceId: balance.id,
            kind: "ISSUE",
          },
        })
      expect(firstFulfillment.quantity).toBe("0.5")
      expect(firstIssue.canonicalEffect.toFixed()).toBe("-6")
      expect(firstIssue.sourceCostMinor).toBe(BigInt(250))
      expect(firstIssue.quantityBefore.toFixed()).toBe("24")
      expect(firstIssue.quantityAfter.toFixed()).toBe("18")
      expect(firstIssue.valueBeforeMinor).toBe(BigInt(1001))
      expect(firstIssue.valueDeltaMinor).toBe(BigInt(-250))
      expect(firstIssue.valueAfterMinor).toBe(BigInt(751))
      const afterFirstPool = await pool()
      expect(afterFirstPool.quantity.toFixed()).toBe("18")
      expect(afterFirstPool.valueMinor).toBe(BigInt(751))

      async function billOrder(orderId: string) {
        await db.$transaction(
          (tx) =>
            postCommerceFinanceJournalInTransaction(tx, {
              tenantId: tenant.id,
              orderId,
              event: "BILLED",
            }),
          { maxWait: 10_000, timeout: 30_000 },
        )
      }
      async function earnOrder(orderId: string) {
        await db.$transaction(
          (tx) =>
            postCommerceFinanceJournalInTransaction(tx, {
              tenantId: tenant.id,
              orderId,
              event: "EARNED",
            }),
          { maxWait: 10_000, timeout: 30_000 },
        )
      }
      async function postOrder(orderId: string) {
        await billOrder(orderId)
        await earnOrder(orderId)
      }
      await postOrder(first.order.id)
      const firstOrderSourceEntries = await db.financeJournalEntry.findMany({
        where: {
          bookId: book.id,
          sourceId: first.order.id,
          sourceKind: {
            in: [
              "COMMERCIAL_ORDER_BILLED",
              "COMMERCIAL_ORDER_EARNED",
              "COMMERCIAL_ORDER_COGS",
            ],
          },
        },
        include: { lines: { orderBy: { id: "asc" } } },
        orderBy: { sequence: "asc" },
      })
      expect(firstOrderSourceEntries).toHaveLength(3)

      const second = await makeOrder("second-sale", "1.5")
      const secondFulfillment = await fulfillCommercialOrderProductLine(db, {
        actorUserId: user.id,
        clientOperationId: `product-issue-cogs-fulfill-second-${runId}`,
        orderLineId: second.line.id,
        schemaVersion: 1,
        tenantId: tenant.id,
      })
      const secondIssue =
        await db.financeInventoryValuationEvent.findFirstOrThrow({
          where: {
            bookId: book.id,
            balanceSourceId: balance.id,
            kind: "ISSUE",
            id: { not: firstIssue.id },
          },
        })
      expect(secondFulfillment.quantity).toBe("1.5")
      expect(secondIssue.canonicalEffect.toFixed()).toBe("-18")
      expect(secondIssue.sourceCostMinor).toBe(BigInt(751))
      expect(secondIssue.quantityBefore.toFixed()).toBe("18")
      expect(secondIssue.quantityAfter.toFixed()).toBe("0")
      expect(secondIssue.valueBeforeMinor).toBe(BigInt(751))
      expect(secondIssue.valueDeltaMinor).toBe(BigInt(-751))
      expect(secondIssue.valueAfterMinor).toBe(BigInt(0))
      const depletedPool = await pool()
      expect(depletedPool.quantity.toFixed()).toBe("0")
      expect(depletedPool.valueMinor).toBe(BigInt(0))

      await postOrder(second.order.id)
      const secondOrderSourceEntries = await db.financeJournalEntry.findMany({
        where: {
          bookId: book.id,
          sourceId: second.order.id,
          sourceKind: {
            in: [
              "COMMERCIAL_ORDER_BILLED",
              "COMMERCIAL_ORDER_EARNED",
              "COMMERCIAL_ORDER_COGS",
            ],
          },
        },
        include: { lines: { orderBy: { id: "asc" } } },
        orderBy: { sequence: "asc" },
      })
      expect(secondOrderSourceEntries).toHaveLength(3)

      const unknown = await makeOrder(
        "unknown-opening-sale",
        "1",
        unknownStore.id,
        unknownBalance.id,
      )
      const unknownFulfillment = await fulfillCommercialOrderProductLine(db, {
        actorUserId: user.id,
        clientOperationId: `product-issue-cogs-fulfill-unknown-${runId}`,
        orderLineId: unknown.line.id,
        schemaVersion: 1,
        tenantId: tenant.id,
      })
      expect(unknownFulfillment.quantity).toBe("1")
      const unknownIssue =
        await db.financeInventoryValuationEvent.findFirstOrThrow({
          where: {
            bookId: book.id,
            balanceSourceId: unknownBalance.id,
            kind: "ISSUE",
          },
        })
      expect(unknownIssue.canonicalEffect.toFixed()).toBe("-12")
      expect(unknownIssue.quantityBefore.toFixed()).toBe("60")
      expect(unknownIssue.quantityAfter.toFixed()).toBe("48")
      expect(unknownIssue.sourceCostMinor).toBeNull()
      expect(unknownIssue.valueDeltaMinor).toBeNull()
      expect(unknownIssue.unknownReason).toBe("MISSING_OPENING_COST")
      const unknownPool = await db.financeInventoryPool.findUniqueOrThrow({
        where: {
          bookId_balanceSourceId: {
            bookId: book.id,
            balanceSourceId: unknownBalance.id,
          },
        },
      })
      expect(unknownPool.quantity.toFixed()).toBe("48")
      expect(unknownPool.valueMinor).toBeNull()
      expect(unknownPool.unknownReason).toBe("MISSING_OPENING_COST")
      await postOrder(unknown.order.id)
      expect(
        await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: "COMMERCIAL_ORDER_COGS",
            sourceId: unknown.order.id,
          },
        }),
      ).toBe(0)

      const receiptAt = new Date()
      const balanceAfterSales = await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: balance.id },
      })
      await recordFinancePurchase(db, {
        ...actor,
        bookId: book.id,
        clientCommandId: `product-issue-cogs-later-receipt-${runId}`,
        supplierId: supplier.id,
        storeId: store.id,
        description: "Later packaged stock receipt after completed issues",
        incurredAt: receiptAt,
        lines: [
          {
            balanceSourceId: balance.id,
            enteredInventoryUnitId: caseUnit.id,
            expectedConfigurationVersionId: configuration.id,
            description: "Later QA case receipt",
            amountMinor: "100",
            enteredQuantity: "1",
            expectedBalanceRevision: balanceAfterSales.revision,
            categories: [{ name: `COGS later ${runId.slice(0, 8)}` }],
          },
        ],
      })
      expect((await pool()).quantity.toFixed()).toBe("12")
      expect((await pool()).valueMinor).toBe(BigInt(100))

      const third = await makeOrder("third-sale", "0.5")
      await fulfillCommercialOrderProductLine(db, {
        actorUserId: user.id,
        clientOperationId: `product-issue-cogs-fulfill-third-${runId}`,
        orderLineId: third.line.id,
        schemaVersion: 1,
        tenantId: tenant.id,
      })
      const thirdIssue =
        await db.financeInventoryValuationEvent.findFirstOrThrow({
          where: {
            bookId: book.id,
            balanceSourceId: balance.id,
            kind: "ISSUE",
            id: { notIn: [firstIssue.id, secondIssue.id] },
          },
        })
      expect(thirdIssue.sourceCostMinor).toBe(BigInt(50))
      expect(thirdIssue.valueAfterMinor).toBe(BigInt(50))

      const cogsAccount = await db.financeAccount.findUniqueOrThrow({
        where: { bookId_code: { bookId: book.id, code: "5000" } },
      })
      await billOrder(third.order.id)
      const journalState = () => db.$queryRaw<
        Array<{
          sequence: string
          commands: string
          entries: string
          lines: string
        }>
      >`
        SELECT b."lastSequence"::text AS sequence,
          (SELECT COUNT(*)::text FROM "FinanceCommand" WHERE "bookId" = b.id) AS commands,
          (SELECT COUNT(*)::text FROM "FinanceJournalEntry" WHERE "bookId" = b.id) AS entries,
          (SELECT COUNT(*)::text FROM "FinanceJournalLine" WHERE "bookId" = b.id) AS lines
        FROM "FinanceBook" b WHERE b.id = ${book.id}
      `
      const beforeFailedPosting = await journalState()
      await db.financeAccount.update({
        where: { id: cogsAccount.id },
        data: { purpose: "OTHER" },
      })
      await expect(earnOrder(third.order.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      })
      expect(
        await db.financeJournalEntry.findMany({
          where: { bookId: book.id, sourceId: third.order.id },
          select: { sourceKind: true },
        }),
      ).toEqual([{ sourceKind: "COMMERCIAL_ORDER_BILLED" }])
      expect(await journalState()).toEqual(beforeFailedPosting)
      await db.financeAccount.update({
        where: { id: cogsAccount.id },
        data: { purpose: cogsAccount.purpose },
      })
      await earnOrder(third.order.id)

      const issueEventsBeforeReplay =
        await db.financeInventoryValuationEvent.findMany({
          where: {
            bookId: book.id,
            balanceSourceId: balance.id,
            kind: "ISSUE",
          },
          orderBy: { sequence: "asc" },
        })

      const commerceEntriesBeforeReplay = await db.financeJournalEntry.findMany(
        {
          where: {
            bookId: book.id,
            sourceKind: {
              in: [
                "COMMERCIAL_ORDER_BILLED",
                "COMMERCIAL_ORDER_EARNED",
                "COMMERCIAL_ORDER_COGS",
              ],
            },
            sourceId: { in: [first.order.id, second.order.id, third.order.id] },
          },
          include: { lines: { orderBy: { id: "asc" } } },
          orderBy: { sequence: "asc" },
        },
      )
      expect(commerceEntriesBeforeReplay).toHaveLength(9)

      expect(
        await fulfillCommercialOrderProductLine(db, fulfillmentInput),
      ).toEqual(firstFulfillment)
      await postOrder(first.order.id)
      await postOrder(second.order.id)
      await postOrder(third.order.id)
      expect(
        await db.financeInventoryValuationEvent.findMany({
          where: {
            bookId: book.id,
            balanceSourceId: balance.id,
            kind: "ISSUE",
          },
          orderBy: { sequence: "asc" },
        }),
      ).toEqual(issueEventsBeforeReplay)
      const commerceEntriesAfterReplay = await db.financeJournalEntry.findMany({
        where: {
          bookId: book.id,
          sourceKind: {
            in: [
              "COMMERCIAL_ORDER_BILLED",
              "COMMERCIAL_ORDER_EARNED",
              "COMMERCIAL_ORDER_COGS",
            ],
          },
          sourceId: { in: [first.order.id, second.order.id, third.order.id] },
        },
        include: { lines: { orderBy: { id: "asc" } } },
        orderBy: { sequence: "asc" },
      })
      expect(commerceEntriesAfterReplay).toEqual(commerceEntriesBeforeReplay)
      const balances = await getFinanceAccountBalances(db, {
        ...actor,
        bookId: book.id,
      })
      const accountBalance = (code: string) =>
        balances.accounts.find((entry) => entry.code === code)?.balanceMinor
      expect(accountBalance("5000")).toBe("1051")
      expect(accountBalance("1300")).toBe("50")
      expect(accountBalance("4000")).toBe("17500")
      for (const [orderId, expectedCost] of [
        [first.order.id, BigInt(250)],
        [second.order.id, BigInt(751)],
        [third.order.id, BigInt(50)],
      ] as const) {
        const cogsEntry = await db.financeJournalEntry.findUniqueOrThrow({
          where: {
            bookId_sourceKind_sourceId: {
              bookId: book.id,
              sourceKind: "COMMERCIAL_ORDER_COGS",
              sourceId: orderId,
            },
          },
          include: { lines: { include: { account: true } } },
        })
        expect(
          cogsEntry.lines.find((line) => line.account.code === "5000")
            ?.debitMinor,
        ).toBe(expectedCost)
        expect(
          cogsEntry.lines.find((line) => line.account.code === "1300")
            ?.creditMinor,
        ).toBe(expectedCost)
      }
      expect(
        await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: {
              in: [
                "COMMERCIAL_ORDER_BILLED",
                "COMMERCIAL_ORDER_EARNED",
                "COMMERCIAL_ORDER_COGS",
              ],
            },
            sourceId: {
              in: [
                first.order.id,
                second.order.id,
                third.order.id,
                unknown.order.id,
              ],
            },
          },
        }),
      ).toBe(11)
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
        db.stockReservation.count({
          where: { id: { in: reservationIds } },
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
        users: 0,
      })
    }
  })
})
