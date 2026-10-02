import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "./accounts"
import { getFinanceBill } from "./bill-reads"
import { recordFinanceMoneyMovement } from "./money"
import {
  getFinancePurchaseBill,
  listFinancePurchaseBills,
} from "./purchase-reads"
import {
  type RecognizeFinancePurchaseInput,
  recognizeFinancePurchase,
  registerFinancePurchase,
} from "./purchase-recognition"
import { getFinancePurchaseRecognition } from "./purchase-recognition-reads"
import { reverseFinancePurchaseRecognition } from "./purchase-recognition-reversals"
import { cleanupPurchaseRecognitionTest } from "./purchase-recognition-test-cleanup"
import {
  allocateFinanceSupplierAdvance,
  payFinancePurchaseBill,
  releaseFinanceSupplierAllocation,
  reverseFinancePurchasePayment,
} from "./purchase-settlements"
import { getFinanceSupplierStatement } from "./supplier-reads"
import {
  createFinanceSupplier,
  recordFinanceSupplierAdvance,
  reverseFinanceSupplierEntry,
} from "./supplier-writes"

const start = new Date("2026-01-01T00:00:00Z")
const date = (day: number) =>
  new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`)

describeWithServiceCommerceDatabase(
  "independent purchase recognition acceptance",
  () => {
    test("timing, transit, settlement, exact correction and atomic receipt evidence", async () => {
      const { prisma: db } = await import("../../client")
      const run = randomUUID()
      console.log(`supplier-recognition run=${run}`)
      let tenantId: string | undefined
      let actorUserId: string | undefined
      let bookId: string | undefined
      const items: string[] = []
      try {
        const user = await db.user.create({
          data: {
            email: `supplier-recognition-${run}@example.invalid`,
            name: "Supplier recognition private QA",
          },
        })
        actorUserId = user.id
        const tenant = await db.tenant.create({
          data: {
            slug: `supplier-recognition-${run}`,
            name: "Supplier recognition private QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantId = tenant.id
        const actor = { tenantId: tenant.id, actorUserId: user.id }
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Recognition QA Store",
            slug: `recognition-${run}`,
            status: "ACTIVE",
          },
        })
        const book = await createFinanceBook(db, { ...actor, startsAt: start })
        bookId = book.id
        const bank = await db.financeAccount.findFirstOrThrow({
          where: { bookId: book.id, purpose: "BANK" },
        })
        await recordFinanceMoneyMovement(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `bank-${run}`,
          kind: "OPENING_BALANCE",
          accountId: bank.id,
          amountMinor: "10000",
          description: "Private opening bank",
          effectiveAt: start,
        })
        const supplier = await createFinanceSupplier(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `supplier-${run}`,
          code: "RECOGNITION",
          name: "Recognition QA supplier",
        })
        const context = { ...actor, bookId: book.id }

        async function balance(label: string) {
          const item = await db.catalogItem.create({
            data: {
              tenantId: tenant.id,
              slug: `recognition-${run}-${label}`,
              kind: "PRODUCT",
              name: "Private recognition goods",
              product: { create: {} },
              variants: {
                create: { key: "default", name: "Default", isDefault: true },
              },
            },
            include: { product: true, variants: true },
          })
          items.push(item.id)
          const variant = item.variants[0]
          if (!item.product || !variant)
            throw new Error("Missing QA product graph")
          const config = await db.unitConfigurationVersion.create({
            data: {
              productId: item.product.id,
              version: 1,
              status: "CURRENT",
              canonicalBalanceScale: 18,
              units: {
                create: {
                  key: "unit",
                  name: "unit",
                  factor: "1",
                  stockBehavior: "CANONICAL_SHARED",
                  transactionScale: 0,
                },
              },
            },
            include: { units: true },
          })
          const unit = config.units[0]
          if (!unit) throw new Error("Missing QA unit")
          await db.catalogProduct.update({
            where: { id: item.product.id },
            data: { currentUnitConfigurationVersionId: config.id },
          })
          const source = await db.stockBalanceSource.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              productId: item.product.id,
              variantId: variant.id,
              inventoryUnitId: unit.id,
              kind: "SHARED_POOL",
            },
          })
          return {
            balanceSourceId: source.id,
            enteredInventoryUnitId: unit.id,
            expectedConfigurationVersionId: config.id,
          }
        }
        const goods = await balance("goods")
        const rollbackGoods = await balance("rollback")

        async function register(label: string, amount: string, extra = false) {
          const input = {
            ...context,
            clientCommandId: `register-${label}-${run}`,
            supplierId: supplier.id,
            storeId: store.id,
            description: `Recognition ${label}`,
            agreedAt: date(1),
            lines: [
              {
                ...goods,
                enteredQuantity: "2",
                amountMinor: amount,
                description: "Agreed goods",
                categories: [{ name: "Purchase" }],
              },
              ...(extra
                ? [
                    {
                      ...rollbackGoods,
                      enteredQuantity: "1",
                      amountMinor: "100",
                      description: "Other goods",
                      categories: [{ name: "Purchase" }],
                    },
                  ]
                : []),
            ],
          }
          const result = await registerFinancePurchase(db, input)
          expect(await registerFinancePurchase(db, input)).toEqual(result)
          return getFinancePurchaseRecognition(db, {
            ...context,
            recognitionId: result.id,
          })
        }
        async function fact(
          document: { id: string },
          stage: RecognizeFinancePurchaseInput["stage"],
          day: number,
          options: Partial<RecognizeFinancePurchaseInput> = {},
        ) {
          return recognizeFinancePurchase(db, {
            ...context,
            recognitionId: document.id,
            clientCommandId: `fact-${document.id}-${stage}`,
            stage,
            effectiveAt: date(day),
            reference: `${stage}-${document.id}`,
            ...options,
          })
        }
        async function totals() {
          const rows = await db.financeJournalLine.findMany({
            where: { bookId: book.id },
            include: { account: true },
          })
          const result: Record<string, bigint> = {}
          for (const line of rows)
            result[line.account.code] =
              (result[line.account.code] ?? BigInt(0)) +
              line.debitMinor -
              line.creditMinor
          return Object.fromEntries(
            Object.entries(result).map(([code, amount]) => [
              code,
              amount.toString(),
            ]),
          )
        }
        async function receive(
          document: Awaited<ReturnType<typeof register>>,
          day: number,
        ) {
          const confirmations = await Promise.all(
            document.lines.map(async (line) => ({
              lineId: line.id,
              expectedBalanceRevision: (
                await db.stockBalanceSource.findUniqueOrThrow({
                  where: { id: line.balanceSourceId },
                })
              ).revision,
            })),
          )
          return fact(document, "RECEIPT", day, { receipts: confirmations })
        }

        console.log(
          `supplier-recognition ${run}: invoice before receipt and paid/allocated invoice`,
        )
        const a = await register("invoice-first", "1000")
        expect(a.events).toHaveLength(0)
        expect(
          await db.financeSupplierEntry.count({ where: { bookId: book.id } }),
        ).toBe(0)
        await expect(
          getFinanceBill(db, {
            ...context,
            billId: (
              await db.financePurchaseRecognition.findUniqueOrThrow({
                where: { id: a.id },
              })
            ).costBillId,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" })
        const invoiceA = await fact(a, "INVOICE", 2, {
          invoiceAmountMinor: "1000",
        })
        expect(await totals()).toMatchObject({
          "1340": "1000",
          "2000": "-1000",
        })
        expect(
          (
            await db.stockBalanceSource.findUniqueOrThrow({
              where: { id: goods.balanceSourceId },
            })
          ).onHandQuantity.toFixed(),
        ).toBe("0")
        const detailA = await getFinancePurchaseRecognition(db, {
          ...context,
          recognitionId: a.id,
        })
        if (!detailA.invoiceBillId)
          throw new Error("Missing recognized invoice")
        expect(
          (
            await getFinancePurchaseBill(db, {
              ...context,
              billId: detailA.invoiceBillId,
            })
          ).recognitionId,
        ).toBe(a.id)
        const advance = await recordFinanceSupplierAdvance(db, {
          ...context,
          clientCommandId: `advance-${run}`,
          supplierId: supplier.id,
          moneyAccountId: bank.id,
          amountMinor: "100",
          effectiveAt: date(2),
          description: "Private advance",
        })
        await allocateFinanceSupplierAdvance(db, {
          ...context,
          clientCommandId: `allocate-${run}`,
          billId: detailA.invoiceBillId,
          advanceEntryId: advance.id,
          amountMinor: "100",
          effectiveAt: date(2),
          description: "Apply existing advance",
        })
        await payFinancePurchaseBill(db, {
          ...context,
          clientCommandId: `pay-${run}`,
          billId: detailA.invoiceBillId,
          moneyAccountId: bank.id,
          amountMinor: "200",
          effectiveAt: date(2),
        })
        expect(
          (
            await getFinancePurchaseBill(db, {
              ...context,
              billId: detailA.invoiceBillId,
            })
          ).outstandingMinor,
        ).toBe("700")
        await fact(a, "OWNERSHIP", 3)
        expect(await totals()).toMatchObject({
          "1340": "0",
          "1310": "1000",
          "2000": "-700",
        })
        expect(
          await db.stockMovement.count({
            where: { operation: { tenantId: tenant.id } },
          }),
        ).toBe(0)
        const receiptInput = {
          ...context,
          recognitionId: a.id,
          clientCommandId: `receipt-replay-${run}`,
          stage: "RECEIPT" as const,
          effectiveAt: date(4),
          reference: "Physical handoff A",
          receipts: a.lines.map((line) => ({
            lineId: line.id,
            expectedBalanceRevision: 0,
          })),
        }
        const [receiptA, repeatedA] = await Promise.all([
          recognizeFinancePurchase(db, receiptInput),
          recognizeFinancePurchase(db, receiptInput),
        ])
        expect(repeatedA).toEqual(receiptA)
        expect(await recognizeFinancePurchase(db, receiptInput)).toEqual(
          receiptA,
        )
        await expect(
          recognizeFinancePurchase(db, {
            ...receiptInput,
            clientCommandId: `duplicate-stage-${run}`,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(await totals()).toMatchObject({
          "1300": "1000",
          "1310": "0",
          "1340": "0",
          "2000": "-700",
          "1250": "0",
        })
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { bookId: book.id },
          }),
        ).toBe(1)
        expect(
          await db.financeSupplierEntry.count({
            where: { bookId: book.id, kind: "PURCHASE_BILL" },
          }),
        ).toBe(1)
        await expect(
          reverseFinancePurchaseRecognition(db, {
            ...context,
            recognitionId: a.id,
            eventId: invoiceA.id,
            clientCommandId: `dependent-${run}`,
            effectiveAt: date(5),
            reason: "Cannot drop earlier invoice",
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        await expect(
          reverseFinancePurchaseRecognition(db, {
            ...context,
            recognitionId: a.id,
            eventId: receiptA.id,
            clientCommandId: `physical-${run}`,
            effectiveAt: date(5),
            reason: "Needs owning return",
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })

        console.log(`supplier-recognition ${run}: receipt before invoice`)
        const b = await register("receipt-first", "700")
        await receive(b, 5)
        expect(await totals()).toMatchObject({
          "1300": "1700",
          "2050": "-700",
          "2000": "-700",
        })
        const poolBeforeInvoice =
          await db.financeInventoryPool.findFirstOrThrow({
            where: { bookId: book.id, balanceSourceId: goods.balanceSourceId },
          })
        await expect(
          fact(b, "INVOICE", 6, { invoiceAmountMinor: "701" }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        const invoiceB = await fact(b, "INVOICE", 6, {
          invoiceAmountMinor: "700",
        })
        expect(await totals()).toMatchObject({
          "1300": "1700",
          "2050": "0",
          "2000": "-1400",
        })
        expect(
          await db.financeInventoryPool.findUniqueOrThrow({
            where: { id: poolBeforeInvoice.id },
          }),
        ).toEqual(poolBeforeInvoice)
        expect(
          await db.financeInventoryValuationEvent.count({
            where: { bookId: book.id },
          }),
        ).toBe(2)
        expect(
          await db.financeSupplierEntry.count({
            where: { bookId: book.id, kind: "PURCHASE_BILL" },
          }),
        ).toBe(2)

        console.log(`supplier-recognition ${run}: owned transit before invoice`)
        const c = await register("transit-first", "500")
        await fact(c, "OWNERSHIP", 5)
        expect(await totals()).toMatchObject({ "1310": "500", "2050": "-500" })
        expect(
          (
            await db.stockBalanceSource.findUniqueOrThrow({
              where: { id: goods.balanceSourceId },
            })
          ).onHandQuantity.toFixed(),
        ).toBe("4")
        await fact(c, "INVOICE", 6, { invoiceAmountMinor: "500" })
        expect(await totals()).toMatchObject({
          "1310": "500",
          "2050": "0",
          "2000": "-1900",
        })
        await receive(c, 7)
        expect(await totals()).toMatchObject({
          "1300": "2200",
          "1310": "0",
          "2050": "0",
          "2000": "-1900",
        })
        const d = await register("direct-arrival", "300")
        await fact(d, "INVOICE", 5, { invoiceAmountMinor: "300" })
        await receive(d, 8)
        expect(await totals()).toMatchObject({
          "1300": "2500",
          "1310": "0",
          "1340": "0",
          "2050": "0",
          "2000": "-2200",
        })
        const pool = await db.financeInventoryPool.findFirstOrThrow({
          where: { bookId: book.id, balanceSourceId: goods.balanceSourceId },
        })
        expect(pool.valueMinor?.toString()).toBe("2500")
        expect(pool.quantity.toFixed()).toBe("8")
        expect(pool.unknownReason).toBeNull()

        console.log(
          `supplier-recognition ${run}: retained corrections and consumed-fund guard`,
        )
        const e = await register("corrected", "400")
        const invoiceE = await fact(e, "INVOICE", 2, {
          invoiceAmountMinor: "400",
        })
        const billE = (
          await getFinancePurchaseRecognition(db, {
            ...context,
            recognitionId: e.id,
          })
        ).invoiceBillId
        if (!billE) throw new Error("Missing E invoice")
        const paymentE = await payFinancePurchaseBill(db, {
          ...context,
          clientCommandId: `pay-e-${run}`,
          billId: billE,
          moneyAccountId: bank.id,
          amountMinor: "50",
          effectiveAt: date(3),
        })
        const reverseE = {
          ...context,
          recognitionId: e.id,
          eventId: invoiceE.id,
          clientCommandId: `reverse-e-${run}`,
          effectiveAt: date(5),
          reason: "Incorrect invoice",
        }
        await expect(
          reverseFinancePurchaseRecognition(db, reverseE),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        await reverseFinancePurchasePayment(db, {
          ...context,
          clientCommandId: `reverse-payment-e-${run}`,
          paymentId: paymentE.id,
          effectiveAt: date(4),
          reason: "Release mistaken payment",
        })
        const advanceE = await recordFinanceSupplierAdvance(db, {
          ...context,
          clientCommandId: `advance-e-${run}`,
          supplierId: supplier.id,
          moneyAccountId: bank.id,
          amountMinor: "50",
          effectiveAt: date(4),
          description: "Invoice correction QA advance",
        })
        const allocationE = await allocateFinanceSupplierAdvance(db, {
          ...context,
          clientCommandId: `allocate-e-${run}`,
          billId: billE,
          advanceEntryId: advanceE.id,
          amountMinor: "50",
          effectiveAt: date(4),
          description: "Consumed invoice advance",
        })
        await expect(
          reverseFinancePurchaseRecognition(db, reverseE),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        await releaseFinanceSupplierAllocation(db, {
          ...context,
          clientCommandId: `release-e-${run}`,
          allocationId: allocationE.id,
          amountMinor: "50",
          effectiveAt: date(4),
          reason: "Release before correcting invoice",
        })
        await reverseFinanceSupplierEntry(db, {
          ...context,
          clientCommandId: `reverse-advance-e-${run}`,
          entryId: advanceE.id,
          effectiveAt: date(4),
          reason: "Correct mistaken advance",
        })
        const originalE = await db.financeJournalEntry.findFirstOrThrow({
          where: {
            bookId: book.id,
            sourceKind: "PURCHASE_BILL",
            sourceId: billE,
          },
          include: { lines: true },
        })
        const correctionE = await reverseFinancePurchaseRecognition(
          db,
          reverseE,
        )
        expect(await reverseFinancePurchaseRecognition(db, reverseE)).toEqual(
          correctionE,
        )
        expect(
          await db.financeJournalEntry.findUniqueOrThrow({
            where: { id: originalE.id },
            include: { lines: true },
          }),
        ).toEqual(originalE)
        const oppositeE = await db.financeJournalEntry.findFirstOrThrow({
          where: { reversalOfId: originalE.id },
          include: { lines: true },
        })
        for (const line of originalE.lines)
          expect(oppositeE.lines).toContainEqual(
            expect.objectContaining({
              accountId: line.accountId,
              debitMinor: line.creditMinor,
              creditMinor: line.debitMinor,
            }),
          )
        expect(
          (await db.financeBill.findUniqueOrThrow({ where: { id: billE } }))
            .voidedAt,
        ).not.toBeNull()
        await expect(fact(e, "OWNERSHIP", 6)).rejects.toMatchObject({
          code: "CONFLICT",
        })
        await expect(
          payFinancePurchaseBill(db, {
            ...context,
            clientCommandId: `void-payment-${run}`,
            billId: billE,
            moneyAccountId: bank.id,
            amountMinor: "1",
            effectiveAt: date(6),
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" })
        const f = await register("transit-correction", "200")
        const ownershipF = await fact(f, "OWNERSHIP", 2)
        await reverseFinancePurchaseRecognition(db, {
          ...context,
          recognitionId: f.id,
          eventId: ownershipF.id,
          clientCommandId: `reverse-transit-${run}`,
          effectiveAt: date(3),
          reason: "Ownership declaration corrected",
        })
        expect(await totals()).toMatchObject({
          "1300": "2500",
          "1310": "0",
          "1340": "0",
          "2050": "0",
          "2000": "-2200",
        })
        // A late invoice may be corrected back to the original retained GRNI receipt.
        await reverseFinancePurchaseRecognition(db, {
          ...context,
          recognitionId: b.id,
          eventId: invoiceB.id,
          clientCommandId: `reverse-late-invoice-${run}`,
          effectiveAt: date(9),
          reason: "Invoice corrected, goods retained",
        })
        expect(await totals()).toMatchObject({
          "1300": "2500",
          "2050": "-700",
          "2000": "-1500",
        })

        console.log(
          `supplier-recognition ${run}: atomic multi-line receipt rollback, scope and date guards`,
        )
        const rollback = await register("rollback", "100", true)
        const sorted = [...rollback.lines].sort((a, b) =>
          a.balanceSourceId.localeCompare(b.balanceSourceId),
        )
        const confirmations = await Promise.all(
          sorted.map(async (line, index) => ({
            lineId: line.id,
            expectedBalanceRevision:
              (
                await db.stockBalanceSource.findUniqueOrThrow({
                  where: { id: line.balanceSourceId },
                })
              ).revision + (index === 1 ? 1 : 0),
          })),
        )
        async function capture() {
          return {
            book: await db.financeBook.findUniqueOrThrow({
              where: { id: book.id },
            }),
            balances: await db.stockBalanceSource.findMany({
              where: { tenantId: tenant.id },
              orderBy: { id: "asc" },
            }),
            pools: await db.financeInventoryPool.findMany({
              where: { bookId: book.id },
              orderBy: { id: "asc" },
            }),
            events: await db.financePurchaseRecognitionEvent.count({
              where: { bookId: book.id },
            }),
            valuations: await db.financeInventoryValuationEvent.count({
              where: { bookId: book.id },
            }),
            commands: await db.financeCommand.count({
              where: { bookId: book.id },
            }),
            movements: await db.stockMovement.count({
              where: { operation: { tenantId: tenant.id } },
            }),
            journals: await db.financeJournalEntry.count({
              where: { bookId: book.id },
            }),
          }
        }
        const before = await capture()
        await expect(
          fact(rollback, "RECEIPT", 10, { receipts: confirmations }),
        ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
        expect(await capture()).toEqual(before)
        await expect(
          fact(rollback, "INVOICE", 0, {
            invoiceAmountMinor: "200",
            effectiveAt: new Date("2025-12-31T12:00:00Z"),
          }),
        ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: date(3) },
        })
        await expect(
          fact(rollback, "INVOICE", 2, { invoiceAmountMinor: "200" }),
        ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: null },
        })
        await expect(
          getFinancePurchaseRecognition(db, {
            ...context,
            tenantId: `foreign-${run}`,
            recognitionId: a.id,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
        const otherSupplier = await createFinanceSupplier(db, {
          ...context,
          clientCommandId: `other-${run}`,
          code: "OTHER",
          name: "Other QA supplier",
        })
        await expect(
          db.$transaction(async (tx) => {
            await tx.financePurchaseRecognition.update({
              where: { id: a.id },
              data: { supplierId: otherSupplier.id },
            })
            throw new Error("FK unexpectedly accepted; rollback")
          }),
        ).rejects.toMatchObject({ code: "P2003" })
        const snapshot = await getFinanceSupplierStatement(db, {
          ...context,
          supplierId: supplier.id,
        })
        expect(snapshot.payableMinor).toBe("1500")
        expect(snapshot.advanceMinor).toBe("0")
        expect(
          (await listFinancePurchaseBills(db, { ...context })).items
            .map((row) => row.id)
            .sort(),
        ).toEqual(
          (
            await db.financeBill.findMany({
              where: { bookId: book.id, kind: "PURCHASE", voidedAt: null },
              select: { id: true },
            })
          )
            .map((row) => row.id)
            .sort(),
        )
        expect(
          await db.financeInventoryPool.findUniqueOrThrow({
            where: { id: pool.id },
          }),
        ).toEqual(pool)
        console.log(`supplier-recognition ${run}: operating checks complete`)
      } finally {
        await cleanupPurchaseRecognitionTest(db, {
          run,
          tenantId,
          actorUserId,
          bookId,
          items,
        })
      }
    }, 900_000)
  },
)
