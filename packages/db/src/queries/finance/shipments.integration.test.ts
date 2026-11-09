import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import {
  adjustFinanceShipmentLineCost,
  closeFinanceShipment,
  confirmFinanceShipment,
  createFinanceShipment,
  getFinanceShipment,
  mapFinanceShipmentLine,
  receiveFinanceShipment,
} from "./shipments"
import { createFinanceSupplier } from "./supplier-writes"

const BOOK_START = new Date("2026-01-01T00:00:00.000Z")
const RATE_DATE = new Date("2026-11-01T00:00:00.000Z")
setDefaultTimeout(300_000)

describeWithServiceCommerceDatabase("incoming shipment landed cost", () => {
  test("China consignment: draft adds no stock, partial and full arrivals reconcile", async () => {
    const { prisma: db } = await import("../../client")
    const suffix = randomUUID()
    const tenantIds: string[] = []
    const catalogItemIds: string[] = []
    let storeId: string | undefined
    let actorUserId: string | undefined
    let bookId: string | undefined

    try {
      const user = await db.user.create({
        data: {
          email: `shipment-${suffix}@example.invalid`,
          name: "Shipment acceptance",
        },
      })
      actorUserId = user.id
      const tenant = await db.tenant.create({
        data: {
          slug: `shipment-${suffix}`,
          name: "Shipment acceptance",
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
      const store = await db.store.create({
        data: {
          tenantId: tenant.id,
          slug: `shipment-${suffix}`,
          name: "Private shipment acceptance store",
          status: "ACTIVE",
        },
      })
      storeId = store.id

      async function createBalance(label: string) {
        const item = await db.catalogItem.create({
          data: {
            tenantId: tenant.id,
            slug: `shipment-${suffix}-${label}`,
            kind: "PRODUCT",
            name: `Private ${label}`,
            product: { create: {} },
            variants: {
              create: { key: "default", name: "Default", isDefault: true },
            },
          },
          include: { product: true, variants: true },
        })
        catalogItemIds.push(item.id)
        const product = item.product,
          variant = item.variants[0]
        if (!product || !variant) throw new Error("Incomplete fixture")
        const configuration = await db.unitConfigurationVersion.create({
          data: {
            productId: product.id,
            version: 1,
            status: "CURRENT",
            canonicalBalanceScale: 18,
            units: {
              create: {
                key: "unit",
                name: "unit",
                factor: "1",
                stockBehavior: "CANONICAL_SHARED",
                transactionScale: 3,
              },
            },
          },
          include: { units: true },
        })
        const unit = configuration.units[0]
        if (!unit) throw new Error("Missing unit")
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
            inventoryUnitId: unit.id,
            kind: "SHARED_POOL",
          },
        })
        return {
          balanceSourceId: balance.id,
          enteredInventoryUnitId: unit.id,
          configurationVersionId: configuration.id,
        }
      }
      const chargers = await createBalance("chargers")
      const powerBanks = await createBalance("power-banks")
      const stock = async (id: string) => {
        const balance = await db.stockBalanceSource.findUniqueOrThrow({
          where: { id },
        })
        return {
          onHand: balance.onHandQuantity.toFixed(),
          revision: balance.revision,
        }
      }

      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: BOOK_START,
      })
      bookId = book.id
      const supplier = await createFinanceSupplier(db, {
        ...actor,
        bookId: book.id,
        clientCommandId: `shipment-supplier-${suffix}`,
        code: `SHP-${suffix.slice(0, 8)}`,
        name: "Shenzhen agent",
      })
      const draft = {
        ...actor,
        bookId: book.id,
        supplierId: supplier.id,
        storeId: store.id,
        name: "China consignment",
        reference: "SZ-001",
        freightAmount: "12000",
        freightCurrencyCode: "NGN",
        rates: [
          {
            currencyCode: "CNY",
            rate: "200",
            rateDate: RATE_DATE,
            source: "Agent quote",
          },
        ],
        lines: [
          {
            description: "Chargers",
            balanceSourceId: chargers.balanceSourceId,
            enteredInventoryUnitId: chargers.enteredInventoryUnitId,
            expectedQuantity: "10",
            sourceCurrencyCode: "CNY",
            sourceUnitPrice: "20",
          },
          {
            description: "Power banks",
            proposedName: "Power bank 20000mAh",
            expectedQuantity: "5",
            sourceCurrencyCode: "CNY",
            sourceUnitPrice: "80",
          },
        ],
      }

      await expect(
        createFinanceShipment(db, {
          ...draft,
          rates: [],
          clientCommandId: `create-norate-${suffix}`,
        }),
      ).rejects.toThrow("Enter the NGN rate for 1 CNY.")

      const created = await createFinanceShipment(db, {
        ...draft,
        clientCommandId: `create-${suffix}`,
      })
      const replayed = await createFinanceShipment(db, {
        ...draft,
        clientCommandId: `create-${suffix}`,
      })
      expect(replayed.id).toBe(created.id)
      await expect(
        createFinanceShipment(db, {
          ...draft,
          name: "Changed",
          clientCommandId: `create-${suffix}`,
        }),
      ).rejects.toThrow("already used with different details")

      const read = () =>
        getFinanceShipment(db, {
          ...actor,
          bookId: book.id,
          shipmentId: created.id,
        })
      let detail = await read()
      expect(detail.status).toBe("DRAFT")
      expect(detail.totals).toEqual({
        goodsMinor: "12000000",
        freightMinor: "1200000",
        adjustmentMinor: "0",
        landedMinor: "13200000",
        receivedCostMinor: "0",
      })
      expect(detail.lines.map((l) => l.landedUnitMinor)).toEqual([
        "440000",
        "1760000",
      ])

      await confirmFinanceShipment(db, {
        ...actor,
        bookId: book.id,
        shipmentId: created.id,
        expectedRevision: detail.revision,
        clientCommandId: `confirm-${suffix}`,
      })
      detail = await read()
      expect(detail.status).toBe("EXPECTED")
      // Expected goods never become available stock.
      expect((await stock(chargers.balanceSourceId)).onHand).toBe("0")
      expect((await stock(powerBanks.balanceSourceId)).onHand).toBe("0")

      const [chargerLine, powerBankLine] = detail.lines
      if (!chargerLine || !powerBankLine) throw new Error("Missing lines")
      const receiptLine = (
        line: { id: string },
        balance: typeof chargers,
        quantity: string,
        revision: number,
      ) => ({
        lineId: line.id,
        quantity,
        expectedBalanceRevision: revision,
        expectedConfigurationVersionId: balance.configurationVersionId,
        categories: [{ name: "Shipment arrival" }],
      })

      await expect(
        receiveFinanceShipment(db, {
          ...actor,
          bookId: book.id,
          shipmentId: created.id,
          receivedAt: new Date("2026-11-08T10:00:00.000Z"),
          clientCommandId: `receive-unmapped-${suffix}`,
          lines: [receiptLine(powerBankLine, powerBanks, "5", 0)],
        }),
      ).rejects.toThrow("Choose the stock item")

      await mapFinanceShipmentLine(db, {
        ...actor,
        bookId: book.id,
        shipmentId: created.id,
        expectedRevision: detail.revision,
        lineId: powerBankLine.id,
        balanceSourceId: powerBanks.balanceSourceId,
        enteredInventoryUnitId: powerBanks.enteredInventoryUnitId,
        clientCommandId: `map-${suffix}`,
      })
      detail = await read()
      await adjustFinanceShipmentLineCost(db, {
        ...actor,
        bookId: book.id,
        shipmentId: created.id,
        expectedRevision: detail.revision,
        lineId: chargerLine.id,
        amountMinor: "200000",
        reason: "Owner reviewed charger landed cost to 4,600",
        clientCommandId: `adjust-${suffix}`,
      })
      detail = await read()
      expect(detail.lines[0]?.landedUnitMinor).toBe("460000")
      expect(detail.totals.adjustmentMinor).toBe("200000")
      expect(detail.totals.landedMinor).toBe("13400000")

      const firstArrival = {
        ...actor,
        bookId: book.id,
        shipmentId: created.id,
        receivedAt: new Date("2026-11-08T10:00:00.000Z"),
        clientCommandId: `receive-1-${suffix}`,
        lines: [
          receiptLine(chargerLine, chargers, "4", 0),
          receiptLine(powerBankLine, powerBanks, "5", 0),
        ],
      }
      const first = await receiveFinanceShipment(db, firstArrival)
      const firstReplay = await receiveFinanceShipment(db, firstArrival)
      expect(firstReplay.id).toBe(first.id)
      expect(await stock(chargers.balanceSourceId)).toEqual({
        onHand: "4",
        revision: 1,
      })
      expect((await stock(powerBanks.balanceSourceId)).onHand).toBe("5")
      detail = await read()
      expect(detail.status).toBe("PARTIALLY_RECEIVED")
      expect(detail.lines.map((l) => l.outstandingQuantity)).toEqual(["6", "0"])
      expect(detail.receipts).toHaveLength(1)
      expect(detail.receipts[0]?.totalMinor).toBe("10640000")
      const bill = await db.financeBill.findUniqueOrThrow({
        where: { id: detail.receipts[0]?.billId },
        include: { lines: true },
      })
      expect(bill.kind).toBe("PURCHASE")
      expect(bill.supplierId).toBe(supplier.id)
      expect(bill.lines.map((l) => l.amountMinor.toString()).sort()).toEqual([
        "1840000",
        "8800000",
      ])

      await expect(
        receiveFinanceShipment(db, {
          ...firstArrival,
          clientCommandId: `receive-over-${suffix}`,
          lines: [receiptLine(chargerLine, chargers, "7", 1)],
        }),
      ).rejects.toThrow("exceeds the outstanding expected quantity")
      expect((await stock(chargers.balanceSourceId)).onHand).toBe("4")

      await receiveFinanceShipment(db, {
        ...firstArrival,
        receivedAt: new Date("2026-11-09T10:00:00.000Z"),
        clientCommandId: `receive-2-${suffix}`,
        lines: [receiptLine(chargerLine, chargers, "6", 1)],
      })
      detail = await read()
      expect(detail.status).toBe("RECEIVED")
      expect(detail.lines[0]?.receivedCostMinor).toBe("4600000")
      expect(detail.totals.receivedCostMinor).toBe(detail.totals.landedMinor)
      expect((await stock(chargers.balanceSourceId)).onHand).toBe("10")
      const pool = await db.financeInventoryPool.findFirstOrThrow({
        where: { bookId: book.id, balanceSourceId: chargers.balanceSourceId },
      })
      expect(pool.valueMinor?.toString()).toBe("4600000")

      await expect(
        closeFinanceShipment(db, {
          ...actor,
          bookId: book.id,
          shipmentId: created.id,
          expectedRevision: detail.revision,
          reason: "Done",
          clientCommandId: `close-${suffix}`,
        }),
      ).rejects.toThrow("already closed")
      await expect(
        getFinanceShipment(db, {
          ...actor,
          bookId: `missing-${suffix}`,
          shipmentId: created.id,
        }),
      ).rejects.toThrow("Financial book not found.")
    } finally {
      await db.$transaction(
        async (tx) => {
          if (bookId) {
            const shipments = { shipment: { bookId } }
            await tx.financeShipmentReceiptLine.deleteMany({
              where: { receipt: { bookId } },
            })
            await tx.financeShipmentReceipt.deleteMany({ where: { bookId } })
            await tx.financeShipmentCostAdjustment.deleteMany({
              where: { bookId },
            })
            await tx.financeShipmentLine.deleteMany({ where: shipments })
            await tx.financeShipmentRate.deleteMany({ where: shipments })
            await tx.financeShipment.deleteMany({ where: { bookId } })
            await tx.financeInventoryValuationEvent.deleteMany({
              where: { bookId },
            })
            await tx.financeInventoryPool.deleteMany({ where: { bookId } })
            await tx.financePurchaseReceiptLine.deleteMany({
              where: { bookId },
            })
            await tx.financeSupplierEntry.deleteMany({ where: { bookId } })
            await tx.financeBillLine.deleteMany({ where: { bookId } })
            await tx.financeBill.deleteMany({ where: { bookId } })
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
          if (bookId) {
            await tx.financeSupplierAccount.deleteMany({ where: { bookId } })
            await tx.financeJournalLine.deleteMany({ where: { bookId } })
            await tx.financeJournalEntry.deleteMany({ where: { bookId } })
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.deleteMany({ where: { id: bookId } })
          }
          if (catalogItemIds.length)
            await tx.catalogItem.deleteMany({
              where: { id: { in: catalogItemIds } },
            })
          if (storeId) await tx.store.deleteMany({ where: { id: storeId } })
          if (tenantIds.length) {
            await tx.membership.deleteMany({
              where: { tenantId: { in: tenantIds } },
            })
            await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
          }
          if (actorUserId)
            await tx.user.deleteMany({ where: { id: actorUserId } })
        },
        { maxWait: 10_000, timeout: 30_000 },
      )
      const remaining = await Promise.all([
        db.tenant.count({ where: { id: { in: tenantIds } } }),
        bookId
          ? db.financeShipment.count({ where: { bookId } })
          : Promise.resolve(0),
        bookId
          ? db.financeBook.count({ where: { id: bookId } })
          : Promise.resolve(0),
        actorUserId
          ? db.user.count({ where: { id: actorUserId } })
          : Promise.resolve(0),
      ])
      if (remaining.some((count) => count !== 0))
        throw new Error(`Shipment fixture ${suffix} remains after cleanup.`)
    }
  })
})
