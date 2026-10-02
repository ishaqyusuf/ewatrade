import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { correctStockOperation } from "../inventory-operations"
import { createFinanceBook } from "./accounts"
import { getFinanceBill, listFinanceBills } from "./bill-reads"
import { payFinanceBill } from "./bills"
import { recordFinanceMoneyMovement } from "./money"
import {
  getFinancePurchaseBill,
  listFinancePurchaseBills,
} from "./purchase-reads"
import {
  allocateFinanceSupplierAdvance,
  payFinancePurchaseBill,
  releaseFinanceSupplierAllocation,
  reverseFinancePurchasePayment,
} from "./purchase-settlements"
import { recordFinancePurchase } from "./purchases"
import { getFinanceAccountBalances } from "./reads"
import { getFinanceSupplierStatement } from "./supplier-reads"
import {
  createFinanceSupplier,
  recordFinanceSupplierAdvance,
  recordFinanceSupplierOpening,
  reverseFinanceSupplierEntry,
} from "./supplier-writes"

const BOOK_START = new Date("2026-01-01T00:00:00.000Z")
const ADVANCE_DATE = new Date("2026-09-01T12:00:00.000Z")
const PURCHASE_DATE = new Date("2026-09-15T12:00:00.000Z")
const SETTLEMENT_DATE = new Date("2026-09-16T12:00:00.000Z")
setDefaultTimeout(480_000)

function assertCleanup(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

describeWithServiceCommerceDatabase(
  "purchase receipt finance acceptance",
  () => {
    test("receipt, bill, advance allocation and payment reconcile under replay and correction", async () => {
      const { prisma: db } = await import("../../client")
      const suffix = randomUUID()
      const email = `purchase-finance-${suffix}@example.invalid`
      const slug = `purchase-finance-${suffix}`
      const tenantIds: string[] = []
      const storeIds: string[] = []
      const catalogItemIds: string[] = []
      const balanceSourceIds: string[] = []
      let actorUserId: string | undefined
      let bookId: string | undefined
      let supplierIds: string[] = []
      let billId: string | undefined
      let advanceEntryId: string | undefined
      let allocationId: string | undefined
      let paymentId: string | undefined

      try {
        const user = await db.user.create({
          data: { email, name: "Purchase finance acceptance" },
        })
        actorUserId = user.id
        const tenant = await db.tenant.create({
          data: {
            slug,
            name: "Purchase finance acceptance",
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
        const foreignSlug = `${slug}-foreign`
        const foreignTenant = await db.tenant.create({
          data: {
            slug: foreignSlug,
            name: "Foreign purchase acceptance business",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
            },
          },
        })
        tenantIds.push(foreignTenant.id)
        const foreignActor = {
          tenantId: foreignTenant.id,
          actorUserId: user.id,
        }
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            slug: `purchase-${suffix}`,
            name: "Private purchase acceptance store",
            status: "ACTIVE",
          },
        })
        storeIds.push(store.id)

        async function createBalance(label: string, alternateCase: boolean) {
          const item = await db.catalogItem.create({
            data: {
              tenantId: tenant.id,
              slug: `purchase-${suffix}-${label}`,
              kind: "PRODUCT",
              name: `Private purchase ${label}`,
              product: { create: {} },
              variants: {
                create: { key: "default", name: "Default", isDefault: true },
              },
            },
            include: { product: true, variants: true },
          })
          catalogItemIds.push(item.id)
          if (!item.product || !item.variants[0]) {
            throw new Error("Incomplete private purchase product fixture")
          }
          const units = alternateCase
            ? [
                {
                  key: "unit",
                  name: "unit",
                  factor: "1",
                  stockBehavior: "CANONICAL_SHARED" as const,
                  transactionScale: 0,
                },
                {
                  key: "case",
                  name: "case",
                  factor: "12",
                  stockBehavior: "ALTERNATE_TRANSACTION" as const,
                  transactionScale: 2,
                },
              ]
            : [
                {
                  key: "unit",
                  name: "unit",
                  factor: "1",
                  stockBehavior: "CANONICAL_SHARED" as const,
                  transactionScale: 3,
                },
              ]
          const configuration = await db.unitConfigurationVersion.create({
            data: {
              productId: item.product.id,
              version: 1,
              status: "CURRENT",
              canonicalBalanceScale: 18,
              units: { create: units },
            },
            include: { units: true },
          })
          await db.catalogProduct.update({
            where: { id: item.product.id },
            data: { currentUnitConfigurationVersionId: configuration.id },
          })
          const balanceUnit = configuration.units.find(
            ({ key }) => key === "unit",
          )
          const enteredUnit = configuration.units.find(({ key }) =>
            alternateCase ? key === "case" : key === "unit",
          )
          const variant = item.variants[0]
          if (!balanceUnit || !enteredUnit || !variant) {
            throw new Error("Missing private purchase inventory units")
          }
          const balance = await db.stockBalanceSource.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              productId: item.product.id,
              variantId: variant.id,
              inventoryUnitId: balanceUnit.id,
              kind: "SHARED_POOL",
              onHandQuantity: "0",
            },
          })
          balanceSourceIds.push(balance.id)
          return {
            balanceSourceId: balance.id,
            enteredInventoryUnitId: enteredUnit.id,
            expectedConfigurationVersionId: configuration.id,
          }
        }

        const caseBalance = await createBalance("cases", true)
        const unitBalance = await createBalance("units", false)
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: BOOK_START,
        })
        bookId = book.id
        const accounts = await db.financeAccount.findMany({
          where: { bookId: book.id },
        })
        const bank = accounts.find(({ purpose }) => purpose === "BANK")
        const inventory = accounts.find(
          ({ purpose }) => purpose === "INVENTORY",
        )
        const payable = accounts.find(({ purpose }) => purpose === "PAYABLE")
        const supplierAdvance = accounts.find(
          ({ purpose }) => purpose === "SUPPLIER_ADVANCE",
        )
        if (!bank || !inventory || !payable || !supplierAdvance) {
          throw new Error("Missing purchase acceptance control accounts")
        }

        await recordFinanceMoneyMovement(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `opening-bank-${suffix}`,
          kind: "OPENING_BALANCE",
          accountId: bank.id,
          amountMinor: "10000",
          description: "Purchase acceptance opening bank balance",
          effectiveAt: BOOK_START,
        })
        const supplier = await createFinanceSupplier(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `supplier-${suffix}`,
          code: `PUR-${suffix.slice(0, 8)}`,
          name: "Purchase acceptance supplier",
        })
        const otherSupplier = await createFinanceSupplier(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `other-supplier-${suffix}`,
          code: `OTH-${suffix.slice(0, 8)}`,
          name: "Other acceptance supplier",
        })
        supplierIds = [supplier.id, otherSupplier.id]
        const advance = await recordFinanceSupplierAdvance(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `advance-${suffix}`,
          supplierId: supplier.id,
          moneyAccountId: bank.id,
          amountMinor: "1200",
          description: "Purchase acceptance advance",
          effectiveAt: ADVANCE_DATE,
        })
        advanceEntryId = advance.id

        const purchaseInput = {
          ...actor,
          bookId: book.id,
          clientCommandId: `purchase-${suffix}`,
          supplierId: supplier.id,
          storeId: store.id,
          description: "Private inventory restock",
          reference: `INV-${suffix.slice(0, 8)}`,
          incurredAt: PURCHASE_DATE,
          dueAt: new Date("2026-10-15T12:00:00.000Z"),
          lines: [
            {
              ...caseBalance,
              description: "Case stock",
              amountMinor: "2000",
              enteredQuantity: "1.25",
              expectedBalanceRevision: 0,
              categories: [{ name: `Purchase ${suffix.slice(0, 8)}` }],
            },
            {
              ...unitBalance,
              description: "Loose stock",
              amountMinor: "1000",
              enteredQuantity: "2.5",
              expectedBalanceRevision: 0,
              categories: [{ name: `Purchase ${suffix.slice(0, 8)}` }],
            },
          ],
        }
        const capturePurchaseState = async (targetBillId: string) => {
          // One statement gives a coherent rejection/replay snapshot without
          // repeating remote reads for every settlement guard.
          const [row] = await db.$queryRaw<Array<{ state: unknown }>>`
            SELECT jsonb_build_object(
              'paidMinor', (SELECT "paidMinor"::text FROM "FinanceBill" WHERE id = ${targetBillId} AND "bookId" = ${book.id}),
              'sequence', (SELECT "lastSequence"::text FROM "FinanceBook" WHERE id = ${book.id}),
              'commands', (SELECT count(*) FROM "FinanceCommand" WHERE "bookId" = ${book.id}),
              'journals', (SELECT count(*) FROM "FinanceJournalEntry" WHERE "bookId" = ${book.id}),
              'journalLines', (SELECT count(*) FROM "FinanceJournalLine" WHERE "bookId" = ${book.id}),
              'payments', (SELECT count(*) FROM "FinanceBillPayment" WHERE "bookId" = ${book.id}),
              'allocations', (SELECT count(*) FROM "FinanceSupplierAllocation" WHERE "bookId" = ${book.id}),
              'releases', (SELECT count(*) FROM "FinanceSupplierAllocationRelease" WHERE "bookId" = ${book.id}),
              'supplierEntries', (SELECT count(*) FROM "FinanceSupplierEntry" WHERE "bookId" = ${book.id}),
              'operations', (SELECT count(*) FROM "StockOperation" WHERE "tenantId" = ${tenant.id}),
              'movements', (SELECT count(*) FROM "StockMovement" movement JOIN "StockOperation" operation ON operation.id = movement."operationId" WHERE operation."tenantId" = ${tenant.id}),
              'categories', (SELECT count(*) FROM "StockOperationCategory" WHERE "tenantId" = ${tenant.id}),
              'categoryNames', (SELECT count(*) FROM "StockOperationCategoryName" WHERE "tenantId" = ${tenant.id}),
              'balances', (SELECT jsonb_agg(amount ORDER BY amount."accountId") FROM (
                SELECT "accountId", sum("debitMinor")::text AS debit, sum("creditMinor")::text AS credit
                FROM "FinanceJournalLine" WHERE "bookId" = ${book.id} GROUP BY "accountId"
              ) amount),
              'stock', (SELECT jsonb_agg(balance ORDER BY balance.id) FROM (
                SELECT id, "onHandQuantity"::text AS quantity, revision
                FROM "StockBalanceSource" WHERE "tenantId" = ${tenant.id}
              ) balance)
            ) AS state
          `
          if (!row) throw new Error("Missing purchase rejection snapshot")
          return row.state
        }

        const baseline = await Promise.all([
          db.financeJournalEntry.count({ where: { bookId: book.id } }),
          db.financeCommand.count({ where: { bookId: book.id } }),
          db.stockOperation.count({ where: { tenantId: tenant.id } }),
          db.stockOperationCategory.count({ where: { tenantId: tenant.id } }),
          db.stockOperationCategoryName.count({
            where: { tenantId: tenant.id },
          }),
        ])
        const [firstPurchaseLine, secondPurchaseLine] = purchaseInput.lines
        const [
          baselineJournalCount,
          baselineCommandCount,
          baselineOperationCount,
        ] = baseline
        if (
          !firstPurchaseLine ||
          !secondPurchaseLine ||
          baselineJournalCount === undefined ||
          baselineCommandCount === undefined ||
          baselineOperationCount === undefined
        ) {
          throw new Error("Missing purchase acceptance baseline counts")
        }
        await expect(
          recordFinancePurchase(db, {
            ...purchaseInput,
            lines: [
              firstPurchaseLine,
              {
                ...secondPurchaseLine,
                expectedBalanceRevision: 1,
              },
            ],
          }),
        ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
        expect(
          await Promise.all([
            db.financeJournalEntry.count({ where: { bookId: book.id } }),
            db.financeCommand.count({ where: { bookId: book.id } }),
            db.stockOperation.count({ where: { tenantId: tenant.id } }),
            db.stockOperationCategory.count({ where: { tenantId: tenant.id } }),
            db.stockOperationCategoryName.count({
              where: { tenantId: tenant.id },
            }),
            db.financeBill.count({
              where: { bookId: book.id, kind: "PURCHASE" },
            }),
            ...balanceSourceIds.map(async (id) => {
              const balance = await db.stockBalanceSource.findUniqueOrThrow({
                where: { id },
              })
              return `${balance.onHandQuantity.toString()}:${balance.revision}`
            }),
          ]),
        ).toEqual([...baseline, 0, "0:0", "0:0"])
        const [first, concurrent] = await Promise.all([
          recordFinancePurchase(db, purchaseInput),
          recordFinancePurchase(db, purchaseInput),
        ])
        expect(concurrent).toEqual(first)
        expect(await recordFinancePurchase(db, purchaseInput)).toEqual(first)
        billId = first.id
        const foreignReplaySnapshot = await Promise.all([
          db.financeCommand.count({ where: { bookId: book.id } }),
          db.financeJournalEntry.count({ where: { bookId: book.id } }),
          db.stockOperation.count({ where: { tenantId: tenant.id } }),
        ])
        await expect(
          recordFinancePurchase(db, {
            ...purchaseInput,
            ...foreignActor,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" })
        expect(
          await Promise.all([
            db.financeCommand.count({ where: { bookId: book.id } }),
            db.financeJournalEntry.count({ where: { bookId: book.id } }),
            db.stockOperation.count({ where: { tenantId: tenant.id } }),
          ]),
        ).toEqual(foreignReplaySnapshot)

        const bill = await db.financeBill.findFirstOrThrow({
          where: { id: billId, bookId: book.id },
          include: {
            lines: {
              orderBy: { position: "asc" },
              include: {
                purchaseReceipt: { include: { stockMovement: true } },
              },
            },
            supplierEntries: {
              include: { journalEntry: { include: { lines: true } } },
            },
          },
        })
        expect(bill.kind).toBe("PURCHASE")
        expect(bill.totalMinor.toString()).toBe("3000")
        expect(bill.paidMinor.toString()).toBe("0")
        expect(bill.lines).toHaveLength(2)
        expect(bill.lines.map(({ position }) => position)).toEqual([0, 1])
        expect(
          bill.lines.map(({ amountMinor }) => amountMinor.toString()),
        ).toEqual(["2000", "1000"])
        expect(bill.lines.every((line) => line.purchaseReceipt)).toBe(true)
        expect(bill.supplierEntries).toHaveLength(1)
        expect(bill.supplierEntries[0]?.kind).toBe("PURCHASE_BILL")
        const purchaseJournal = bill.supplierEntries[0]?.journalEntry
        expect(purchaseJournal?.lines).toHaveLength(2)
        expect(
          purchaseJournal?.lines.filter(
            (line) =>
              line.accountId === inventory.id &&
              line.debitMinor === BigInt("3000") &&
              line.creditMinor === BigInt(0),
          ),
        ).toHaveLength(1)
        expect(
          purchaseJournal?.lines.find((line) => line.accountId === payable.id),
        ).toMatchObject({ debitMinor: BigInt(0), creditMinor: BigInt("3000") })
        const purchaseJournalCount = await db.financeJournalEntry.count({
          where: {
            bookId: book.id,
            sourceKind: "PURCHASE_BILL",
            sourceId: bill.id,
          },
        })
        expect(purchaseJournalCount).toBe(1)
        const afterPurchaseCounts = await Promise.all([
          db.financeJournalEntry.count({ where: { bookId: book.id } }),
          db.financeCommand.count({ where: { bookId: book.id } }),
          db.stockOperation.count({ where: { tenantId: tenant.id } }),
        ])
        const [
          journalCountAfterPurchase,
          commandCountAfterPurchase,
          operationCountAfterPurchase,
        ] = afterPurchaseCounts
        if (
          journalCountAfterPurchase === undefined ||
          commandCountAfterPurchase === undefined ||
          operationCountAfterPurchase === undefined
        ) {
          throw new Error("Missing purchase acceptance result counts")
        }
        expect(journalCountAfterPurchase - baselineJournalCount).toBe(1)
        expect(commandCountAfterPurchase - baselineCommandCount).toBe(2)
        expect(operationCountAfterPurchase - baselineOperationCount).toBe(2)

        const movements = bill.lines.map(
          (line) => line.purchaseReceipt?.stockMovement,
        )
        expect(
          movements.map((movement) => movement?.enteredQuantity.toString()),
        ).toEqual(["1.25", "2.5"])
        expect(
          movements.map((movement) => movement?.unitFactorSnapshot.toString()),
        ).toEqual(["12", "1"])
        expect(
          movements.map((movement) =>
            movement?.signedCanonicalEffect.toString(),
          ),
        ).toEqual(["15", "2.5"])
        expect(
          await Promise.all(
            balanceSourceIds.map(async (id) =>
              (
                await db.stockBalanceSource.findUniqueOrThrow({ where: { id } })
              ).onHandQuantity.toString(),
            ),
          ),
        ).toEqual(["15", "2.5"])

        const detail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: bill.id,
        })
        expect(detail.totalMinor).toBe("3000")
        expect(detail.paidMinor).toBe("0")
        expect(detail.outstandingMinor).toBe("3000")
        expect(detail.coverage).toEqual({
          receipts: "LINKED_MOVEMENT_PER_LINE",
          valuation: "PURCHASE_RECEIPTS_ONLY",
          cogs: "NOT_IMPLEMENTED",
        })
        expect(
          detail.lines.map((line) => line.receipt?.stockMovementId),
        ).toHaveLength(2)
        expect(detail.lines.map((line) => line.amountMinor)).toEqual([
          "2000",
          "1000",
        ])

        const linkedReceipt = detail.lines[0]?.receipt
        const linkedMovement = linkedReceipt?.movement
        const otherReceipt = detail.lines[1]?.receipt
        if (!linkedReceipt || !linkedMovement || !otherReceipt) {
          throw new Error(
            "Purchase detail is missing its linked receipt source",
          )
        }
        const receiptIntegritySnapshot = await capturePurchaseState(bill.id)
        await expect(
          correctStockOperation(db, {
            actorUserId: user.id,
            clientOperationId: `generic-correction-${suffix}`,
            corrections: [
              {
                movementId: linkedMovement.id,
                correctedEnteredQuantity: "1.5",
                expectedBalanceRevision: 1,
              },
            ],
            reason: "Attempt direct inventory correction of financial receipt",
            schemaVersion: 1,
            source: "purchase_acceptance",
            targetOperationId: linkedReceipt.stockOperationId,
            tenantId: tenant.id,
          }),
        ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          receiptIntegritySnapshot,
        )
        await expect(
          db.$transaction(
            async (tx) => {
              await tx.financePurchaseReceiptLine.update({
                where: { id: linkedReceipt.id },
                data: { tenantId: foreignTenant.id },
              })
              throw new Error("Cross-Tenant receipt FK unexpectedly accepted")
            },
            { maxWait: 10_000, timeout: 30_000 },
          ),
        ).rejects.toMatchObject({ code: "P2003" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          receiptIntegritySnapshot,
        )
        await expect(
          db.$transaction(
            async (tx) => {
              await tx.financePurchaseReceiptLine.update({
                where: { id: linkedReceipt.id },
                data: { stockOperationId: otherReceipt.stockOperationId },
              })
              throw new Error(
                "Mismatched operation/movement FK unexpectedly accepted",
              )
            },
            { maxWait: 10_000, timeout: 30_000 },
          ),
        ).rejects.toMatchObject({ code: "P2003" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          receiptIntegritySnapshot,
        )

        await expect(
          getFinanceBill(db, { ...actor, bookId: book.id, billId: bill.id }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" })
        const expenses = await listFinanceBills(db, {
          ...actor,
          bookId: book.id,
        })
        expect(expenses.items.some((item) => item.id === bill.id)).toBe(false)
        const beforeGenericPayment = await capturePurchaseState(bill.id)
        await expect(
          payFinanceBill(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `generic-pay-purchase-${suffix}`,
            billId: bill.id,
            accountId: bank.id,
            amountMinor: "1",
            effectiveAt: SETTLEMENT_DATE,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          beforeGenericPayment,
        )
        const purchases = await listFinancePurchaseBills(db, {
          ...actor,
          bookId: book.id,
          supplierId: supplier.id,
          limit: 5,
        })
        expect(purchases.count).toBe(1)
        expect(purchases.items.map((item) => item.id)).toEqual([bill.id])
        expect(purchases.items[0]?.totalMinor).toBe("3000")
        expect(purchases.summary).toMatchObject({
          incurredMinor: "3000",
          paidMinor: "0",
        })

        const statementBeforeSettlement = await getFinanceSupplierStatement(
          db,
          {
            ...actor,
            bookId: book.id,
            supplierId: supplier.id,
          },
        )
        expect(statementBeforeSettlement.payableMinor).toBe("3000")
        expect(statementBeforeSettlement.advanceMinor).toBe("1200")

        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: PURCHASE_DATE },
        })
        const closedSnapshot = await capturePurchaseState(bill.id)
        await expect(
          payFinancePurchaseBill(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `closed-payment-${suffix}`,
            billId: bill.id,
            moneyAccountId: bank.id,
            amountMinor: "1",
            effectiveAt: PURCHASE_DATE,
          }),
        ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
        expect(await capturePurchaseState(bill.id)).toEqual(closedSnapshot)
        await db.financeBook.update({
          where: { id: book.id },
          data: { closedThrough: null },
        })

        const otherAdvance = await recordFinanceSupplierAdvance(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `other-advance-${suffix}`,
          supplierId: otherSupplier.id,
          moneyAccountId: bank.id,
          amountMinor: "100",
          description: "Wrong-supplier advance probe",
          effectiveAt: ADVANCE_DATE,
        })
        const wrongSupplierSnapshot = await capturePurchaseState(bill.id)
        await expect(
          allocateFinanceSupplierAdvance(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `wrong-supplier-allocation-${suffix}`,
            billId: bill.id,
            advanceEntryId: otherAdvance.id,
            amountMinor: "1",
            effectiveAt: SETTLEMENT_DATE,
            description: "Wrong supplier probe",
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          wrongSupplierSnapshot,
        )
        await reverseFinanceSupplierEntry(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `reverse-other-advance-${suffix}`,
          entryId: otherAdvance.id,
          effectiveAt: SETTLEMENT_DATE,
          reason: "Close wrong-supplier allocation probe",
        })

        const allocation = await allocateFinanceSupplierAdvance(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `allocation-${suffix}`,
          billId: bill.id,
          advanceEntryId: advance.id,
          amountMinor: "700",
          effectiveAt: SETTLEMENT_DATE,
          description: "Apply supplier advance",
        })
        allocationId = allocation.id
        expect(
          await allocateFinanceSupplierAdvance(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `allocation-${suffix}`,
            billId: bill.id,
            advanceEntryId: advance.id,
            amountMinor: "700",
            effectiveAt: SETTLEMENT_DATE,
            description: "Apply supplier advance",
          }),
        ).toEqual(allocation)
        const allocationCounts = await Promise.all([
          db.financeSupplierAllocation.count({ where: { id: allocation.id } }),
          db.financeJournalEntry.count({ where: { bookId: book.id } }),
        ])
        const [originalAllocationCount] = allocationCounts
        if (originalAllocationCount === undefined) {
          throw new Error("Missing purchase allocation count")
        }
        expect(originalAllocationCount).toBe(1)
        const consumedAdvanceSnapshot = await capturePurchaseState(bill.id)
        await expect(
          allocateFinanceSupplierAdvance(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `overallocate-${suffix}`,
            billId: bill.id,
            advanceEntryId: advance.id,
            amountMinor: "501",
            effectiveAt: SETTLEMENT_DATE,
            description: "Exceed remaining advance",
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        await expect(
          reverseFinanceSupplierEntry(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `reverse-consumed-advance-${suffix}`,
            entryId: advance.id,
            effectiveAt: SETTLEMENT_DATE,
            reason: "Cannot reverse while allocated",
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          consumedAdvanceSnapshot,
        )

        const payment = await payFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `payment-${suffix}`,
          billId: bill.id,
          moneyAccountId: bank.id,
          amountMinor: "600",
          effectiveAt: SETTLEMENT_DATE,
          reference: "BANK-TRANSFER-1",
          description: "Part payment",
        })
        paymentId = payment.id
        expect(
          await payFinancePurchaseBill(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `payment-${suffix}`,
            billId: bill.id,
            moneyAccountId: bank.id,
            amountMinor: "600",
            effectiveAt: SETTLEMENT_DATE,
            reference: "BANK-TRANSFER-1",
            description: "Part payment",
          }),
        ).toEqual(payment)
        const paymentSnapshot = await capturePurchaseState(bill.id)
        await expect(
          payFinancePurchaseBill(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `overpay-${suffix}`,
            billId: bill.id,
            moneyAccountId: bank.id,
            amountMinor: "1701",
            effectiveAt: SETTLEMENT_DATE,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(await capturePurchaseState(bill.id)).toEqual(paymentSnapshot)

        let currentDetail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: bill.id,
        })
        expect(currentDetail.paidMinor).toBe("1300")
        expect(currentDetail.allocatedMinor).toBe("700")
        expect(currentDetail.outstandingMinor).toBe("1700")
        expect(currentDetail.payments.map((row) => row.amountMinor)).toEqual([
          "600",
        ])
        expect(currentDetail.allocations.map((row) => row.amountMinor)).toEqual(
          ["700"],
        )

        const pinned = await getFinanceSupplierStatement(db, {
          ...actor,
          bookId: book.id,
          supplierId: supplier.id,
          snapshotSequence: statementBeforeSettlement.snapshotSequence,
        })
        expect(pinned.data).toEqual(statementBeforeSettlement.data)
        expect(pinned.payableMinor).toBe("3000")
        expect(pinned.advanceMinor).toBe("1200")

        const bankAfterPayment = await getFinanceAccountBalances(db, {
          ...actor,
          bookId: book.id,
        })
        expect(
          bankAfterPayment.accounts.find(({ id }) => id === bank.id)
            ?.balanceMinor,
        ).toBe("8200")
        expect(
          bankAfterPayment.accounts.find(({ id }) => id === payable.id)
            ?.balanceMinor,
        ).toBe("1700")
        expect(
          bankAfterPayment.accounts.find(({ id }) => id === supplierAdvance.id)
            ?.balanceMinor,
        ).toBe("500")
        expect(
          bankAfterPayment.accounts.find(({ id }) => id === inventory.id)
            ?.balanceMinor,
        ).toBe("3000")

        const partialReleaseInput = {
          ...actor,
          bookId: book.id,
          clientCommandId: `release-partial-${suffix}`,
          allocationId: allocation.id,
          amountMinor: "200",
          effectiveAt: new Date("2026-09-17T12:00:00.000Z"),
          reason: "Return part to supplier advance",
        }
        const releasedPartial = await releaseFinanceSupplierAllocation(
          db,
          partialReleaseInput,
        )
        expect(releasedPartial.id).toBeTruthy()
        const partialReleaseSnapshot = await capturePurchaseState(bill.id)
        expect(
          await releaseFinanceSupplierAllocation(db, partialReleaseInput),
        ).toEqual(releasedPartial)
        expect(await capturePurchaseState(bill.id)).toEqual(
          partialReleaseSnapshot,
        )
        const beforeBackdatedRelease = await capturePurchaseState(bill.id)
        await expect(
          releaseFinanceSupplierAllocation(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `backdated-release-${suffix}`,
            allocationId: allocation.id,
            amountMinor: "1",
            effectiveAt: SETTLEMENT_DATE,
            reason: "Reject release before the latest release",
          }),
        ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          beforeBackdatedRelease,
        )
        currentDetail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: bill.id,
        })
        expect(currentDetail.paidMinor).toBe("1100")
        expect(currentDetail.releasedAllocationMinor).toBe("200")
        expect(currentDetail.outstandingMinor).toBe("1900")

        await releaseFinanceSupplierAllocation(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `release-rest-${suffix}`,
          allocationId: allocation.id,
          amountMinor: "500",
          effectiveAt: new Date("2026-09-18T12:00:00.000Z"),
          reason: "Release remaining advance",
        })
        currentDetail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: bill.id,
        })
        expect(currentDetail.paidMinor).toBe("600")
        expect(currentDetail.releasedAllocationMinor).toBe("700")
        expect(currentDetail.outstandingMinor).toBe("2400")
        const beforeBackdatedReallocation = await capturePurchaseState(bill.id)
        await expect(
          allocateFinanceSupplierAdvance(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `backdated-reallocation-${suffix}`,
            billId: bill.id,
            advanceEntryId: advance.id,
            amountMinor: "100",
            effectiveAt: new Date("2026-09-17T12:00:00.000Z"),
            description: "Reject allocation before the latest release",
          }),
        ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          beforeBackdatedReallocation,
        )
        const beforeBackdatedAdvanceReversal = await capturePurchaseState(
          bill.id,
        )
        await expect(
          reverseFinanceSupplierEntry(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `backdated-advance-reversal-${suffix}`,
            entryId: advance.id,
            effectiveAt: new Date("2026-09-17T12:00:00.000Z"),
            reason: "Reject reversal before the latest advance release",
          }),
        ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          beforeBackdatedAdvanceReversal,
        )

        const openingAdvance = await recordFinanceSupplierOpening(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `opening-advance-${suffix}`,
          supplierId: supplier.id,
          kind: "ADVANCE",
          amountMinor: "100",
          description: "Purchase acceptance opening advance",
          effectiveAt: BOOK_START,
        })
        const openingAllocation = await allocateFinanceSupplierAdvance(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `opening-allocation-${suffix}`,
          billId: bill.id,
          advanceEntryId: openingAdvance.id,
          amountMinor: "100",
          effectiveAt: new Date("2026-09-19T12:00:00.000Z"),
          description: "Apply opening supplier advance",
        })
        const consumedOpeningSnapshot = await capturePurchaseState(bill.id)
        await expect(
          reverseFinanceSupplierEntry(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `reverse-consumed-opening-${suffix}`,
            entryId: openingAdvance.id,
            effectiveAt: new Date("2026-09-20T12:00:00.000Z"),
            reason: "Cannot reverse consumed opening advance",
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          consumedOpeningSnapshot,
        )
        const openingReleaseInput = {
          ...actor,
          bookId: book.id,
          clientCommandId: `opening-release-${suffix}`,
          allocationId: openingAllocation.id,
          amountMinor: "100",
          effectiveAt: new Date("2026-09-20T12:00:00.000Z"),
          reason: "Release opening advance before correction",
        }
        const openingRelease = await releaseFinanceSupplierAllocation(
          db,
          openingReleaseInput,
        )
        const openingReleaseSnapshot = await capturePurchaseState(bill.id)
        expect(
          await releaseFinanceSupplierAllocation(db, openingReleaseInput),
        ).toEqual(openingRelease)
        expect(await capturePurchaseState(bill.id)).toEqual(
          openingReleaseSnapshot,
        )
        const reverseOpeningInput = {
          ...actor,
          bookId: book.id,
          clientCommandId: `reverse-opening-advance-${suffix}`,
          entryId: openingAdvance.id,
          effectiveAt: new Date("2026-09-21T12:00:00.000Z"),
          reason: "Correct opening supplier advance",
        }
        const reversedOpening = await reverseFinanceSupplierEntry(
          db,
          reverseOpeningInput,
        )
        expect(
          await reverseFinanceSupplierEntry(db, reverseOpeningInput),
        ).toEqual(reversedOpening)
        await reverseFinanceSupplierEntry(db, {
          ...actor,
          bookId: book.id,
          clientCommandId: `reverse-advance-${suffix}`,
          entryId: advance.id,
          effectiveAt: new Date("2026-09-22T12:00:00.000Z"),
          reason: "Return supplier advance",
        })
        const reversePaymentInput = {
          ...actor,
          bookId: book.id,
          clientCommandId: `reverse-payment-${suffix}`,
          paymentId: payment.id,
          effectiveAt: new Date("2026-09-23T12:00:00.000Z"),
          reason: "Bank payment reported twice",
        }
        const reversedPayment = await reverseFinancePurchasePayment(
          db,
          reversePaymentInput,
        )
        expect(reversedPayment.id).toBeTruthy()
        const reversedPaymentSnapshot = await capturePurchaseState(bill.id)
        expect(
          await reverseFinancePurchasePayment(db, reversePaymentInput),
        ).toEqual(reversedPayment)
        expect(await capturePurchaseState(bill.id)).toEqual(
          reversedPaymentSnapshot,
        )
        await expect(
          reverseFinancePurchasePayment(db, {
            ...reversePaymentInput,
            clientCommandId: `reverse-payment-again-${suffix}`,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          reversedPaymentSnapshot,
        )
        await expect(
          payFinancePurchaseBill(db, {
            ...actor,
            bookId: book.id,
            clientCommandId: `backdated-payment-after-reversal-${suffix}`,
            billId: bill.id,
            moneyAccountId: bank.id,
            amountMinor: "1",
            effectiveAt: new Date("2026-09-22T12:00:00.000Z"),
          }),
        ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
        expect(await capturePurchaseState(bill.id)).toEqual(
          reversedPaymentSnapshot,
        )
        const finalDetail = await getFinancePurchaseBill(db, {
          ...actor,
          bookId: book.id,
          billId: bill.id,
        })
        expect(finalDetail.paidMinor).toBe("0")
        expect(finalDetail.outstandingMinor).toBe("3000")
        expect(finalDetail.payments).toHaveLength(1)
        expect(finalDetail.payments[0]?.reversedAt).not.toBeNull()
        expect(finalDetail.allocations).toHaveLength(2)
        const originalAllocationDetail = finalDetail.allocations.find(
          (row) => row.id === allocation.id,
        )
        const openingAllocationDetail = finalDetail.allocations.find(
          (row) => row.id === openingAllocation.id,
        )
        expect(
          originalAllocationDetail?.releases.map((row) => row.amountMinor),
        ).toEqual(["500", "200"])
        expect(
          openingAllocationDetail?.releases.map((row) => row.amountMinor),
        ).toEqual(["100"])

        const finalBalances = await getFinanceAccountBalances(db, {
          ...actor,
          bookId: book.id,
        })
        expect(
          finalBalances.accounts.find(({ id }) => id === bank.id)?.balanceMinor,
        ).toBe("10000")
        expect(
          finalBalances.accounts.find(({ id }) => id === payable.id)
            ?.balanceMinor,
        ).toBe("3000")
        expect(
          finalBalances.accounts.find(({ id }) => id === supplierAdvance.id)
            ?.balanceMinor,
        ).toBe("0")
        expect(
          finalBalances.accounts.find(({ id }) => id === inventory.id)
            ?.balanceMinor,
        ).toBe("3000")
        const finalStatement = await getFinanceSupplierStatement(db, {
          ...actor,
          bookId: book.id,
          supplierId: supplier.id,
        })
        expect(finalStatement.payableMinor).toBe("3000")
        expect(finalStatement.advanceMinor).toBe("0")

        const finalPurchaseList = await listFinancePurchaseBills(db, {
          ...actor,
          bookId: book.id,
          supplierId: supplier.id,
        })
        expect(finalPurchaseList.count).toBe(1)
        expect(finalPurchaseList.items[0]?.id).toBe(bill.id)
        expect(finalPurchaseList.items[0]?.paidMinor).toBe("0")
        expect(finalPurchaseList.summary).toMatchObject({
          incurredMinor: "3000",
          paidMinor: "0",
          outstandingMinor: "3000",
        })

        const membership = await db.membership.findFirstOrThrow({
          where: { tenantId: tenant.id, userId: user.id },
        })
        await db.membership.update({
          where: { id: membership.id },
          data: { status: "REMOVED" },
        })
        await expect(
          recordFinancePurchase(db, purchaseInput),
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
        })
        await db.membership.update({
          where: { id: membership.id },
          data: { status: "ACTIVE" },
        })
      } finally {
        await db.$transaction(
          async (tx) => {
            if (bookId) {
              const scope = { bookId }
              await tx.financeInventoryValuationEvent.deleteMany({
                where: scope,
              })
              await tx.financeInventoryPool.deleteMany({ where: scope })
              await tx.financePurchaseReceiptLine.deleteMany({ where: scope })
              await tx.financeSupplierAllocationRelease.deleteMany({
                where: scope,
              })
              await tx.financeSupplierAllocation.deleteMany({ where: scope })
              await tx.financeSupplierEntry.deleteMany({
                where: { ...scope, reversalOfId: { not: null } },
              })
              await tx.financeSupplierEntry.deleteMany({ where: scope })
              await tx.financeBillPayment.deleteMany({ where: scope })
              await tx.financeBillLine.deleteMany({ where: scope })
              await tx.financeBill.deleteMany({ where: scope })
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
              await tx.financeJournalEntry.deleteMany({
                where: { bookId, reversalOfId: { not: null } },
              })
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
          remainingBooks,
          remainingBalances,
          remainingBills,
          remainingSuppliers,
          remainingUser,
          remainingMemberships,
          remainingCommands,
          remainingJournals,
          remainingJournalLines,
          remainingAccounts,
          remainingOperations,
          remainingMovements,
          remainingCategories,
          remainingCategoryNames,
          remainingReceipts,
          remainingAllocations,
          remainingReleases,
          remainingPayments,
          remainingBillLines,
          remainingSupplierEntries,
        ] = await Promise.all([
          db.tenant.count({ where: { id: { in: tenantIds } } }),
          db.store.count({ where: { id: { in: storeIds } } }),
          db.catalogItem.count({ where: { id: { in: catalogItemIds } } }),
          bookId
            ? db.financeBook.count({ where: { id: bookId } })
            : Promise.resolve(0),
          db.stockBalanceSource.count({
            where: { id: { in: balanceSourceIds } },
          }),
          billId
            ? db.financeBill.count({ where: { id: billId } })
            : Promise.resolve(0),
          supplierIds.length
            ? db.financeSupplierAccount.count({
                where: { id: { in: supplierIds } },
              })
            : Promise.resolve(0),
          actorUserId
            ? db.user.count({ where: { id: actorUserId } })
            : Promise.resolve(0),
          tenantIds.length && actorUserId
            ? db.membership.count({
                where: { tenantId: { in: tenantIds }, userId: actorUserId },
              })
            : Promise.resolve(0),
          bookId
            ? db.financeCommand.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeJournalEntry.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeJournalLine.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeAccount.count({ where: { bookId } })
            : Promise.resolve(0),
          tenantIds.length
            ? db.stockOperation.count({
                where: { tenantId: { in: tenantIds } },
              })
            : Promise.resolve(0),
          tenantIds.length
            ? db.stockMovement.count({
                where: { operation: { tenantId: { in: tenantIds } } },
              })
            : Promise.resolve(0),
          tenantIds.length
            ? db.stockOperationCategory.count({
                where: { tenantId: { in: tenantIds } },
              })
            : Promise.resolve(0),
          tenantIds.length
            ? db.stockOperationCategoryName.count({
                where: { tenantId: { in: tenantIds } },
              })
            : Promise.resolve(0),
          bookId
            ? db.financePurchaseReceiptLine.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeSupplierAllocation.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeSupplierAllocationRelease.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeBillPayment.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeBillLine.count({ where: { bookId } })
            : Promise.resolve(0),
          bookId
            ? db.financeSupplierEntry.count({ where: { bookId } })
            : Promise.resolve(0),
        ])
        assertCleanup(
          [
            remainingTenants,
            remainingStores,
            remainingItems,
            remainingBooks,
            remainingBalances,
            remainingBills,
            remainingSuppliers,
            remainingUser,
            remainingMemberships,
            remainingCommands,
            remainingJournals,
            remainingJournalLines,
            remainingAccounts,
            remainingOperations,
            remainingMovements,
            remainingCategories,
            remainingCategoryNames,
            remainingReceipts,
            remainingAllocations,
            remainingReleases,
            remainingPayments,
            remainingBillLines,
            remainingSupplierEntries,
          ].every((count) => count === 0),
          `Purchase acceptance fixture ${suffix} remains after cleanup (advance=${advanceEntryId ?? "none"}, allocation=${allocationId ?? "none"}, payment=${paymentId ?? "none"}).`,
        )
      }
    }, 480_000)
  },
)
