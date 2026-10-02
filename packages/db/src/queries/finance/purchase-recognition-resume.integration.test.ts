import { expect, test } from "bun:test"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { listFinancePurchaseBills } from "./purchase-reads"
import { recognizeFinancePurchase } from "./purchase-recognition"
import { getFinancePurchaseRecognition } from "./purchase-recognition-reads"
import { cleanupPurchaseRecognitionTest } from "./purchase-recognition-test-cleanup"
import { getFinanceSupplierStatement } from "./supplier-reads"
import { createFinanceSupplier } from "./supplier-writes"

const run = process.env.SUPPLIER_RECOGNITION_RESUME_RUN
const day = (value: number) =>
  new Date(`2026-09-${String(value).padStart(2, "0")}T12:00:00Z`)

describeWithServiceCommerceDatabase(
  "resume owned supplier recognition acceptance",
  () => {
    test.skipIf(!run)(
      "finish unverified guards, reconcile retained evidence and clean exact owned fixture",
      async () => {
        if (!run || !/^[0-9a-f-]{36}$/.test(run))
          throw new Error("Supply an exact owned acceptance run UUID")
        const { prisma: db } = await import("../../client")
        const tenant = await db.tenant.findFirstOrThrow({
          where: {
            slug: `supplier-recognition-${run}`,
            dataClassification: "QA",
          },
        })
        const user = await db.user.findUniqueOrThrow({
          where: { email: `supplier-recognition-${run}@example.invalid` },
        })
        const book = await db.financeBook.findFirstOrThrow({
          where: { tenantId: tenant.id },
        })
        const membership = await db.membership.findFirstOrThrow({
          where: {
            tenantId: tenant.id,
            userId: user.id,
            role: "OWNER",
            status: "ACTIVE",
          },
        })
        expect(membership.tenantId).toBe(book.tenantId)
        const items = (
          await db.catalogItem.findMany({
            where: { tenantId: tenant.id },
            select: { id: true },
          })
        ).map((item) => item.id)
        const context = {
          tenantId: tenant.id,
          actorUserId: user.id,
          bookId: book.id,
        }
        console.log(
          `supplier-recognition resume run=${run}: exact ownership preflight clear`,
        )
        try {
          const docs = await db.financePurchaseRecognition.findMany({
            where: { bookId: book.id },
            include: {
              costBill: true,
              events: {
                include: { journalEntry: { include: { lines: true } } },
              },
              lines: true,
            },
          })
          expect(docs).toHaveLength(7)
          const root = docs.find(
            (doc) => doc.costBill.description === "Recognition rollback",
          )
          const invoiceFirst = docs.find(
            (doc) => doc.costBill.description === "Recognition invoice-first",
          )
          if (!root || !invoiceFirst)
            throw new Error("The retained changed-flow prerequisite is missing")
          // Reconcile final immutable sources without replaying the accepted timing matrix.
          const journalLines = await db.financeJournalLine.findMany({
            where: { bookId: book.id },
            include: { account: true },
          })
          const totals: Record<string, bigint> = {}
          for (const line of journalLines)
            totals[line.account.code] =
              (totals[line.account.code] ?? BigInt(0)) +
              line.debitMinor -
              line.creditMinor
          expect(
            Object.fromEntries(
              Object.entries(totals).map(([code, amount]) => [
                code,
                amount.toString(),
              ]),
            ),
          ).toMatchObject({
            "1300": "2500",
            "1310": "0",
            "1340": "0",
            "2050": "-700",
            "2000": "-1500",
            "1250": "0",
          })
          expect(root.events).toHaveLength(0)
          expect(
            await db.financeCommand.count({
              where: {
                bookId: book.id,
                clientCommandId: `fact-${root.id}-RECEIPT`,
              },
            }),
          ).toBe(0)
          const pools = await db.financeInventoryPool.findMany({
            where: { bookId: book.id },
          })
          const pool = pools[0]
          if (!pool) throw new Error("The accepted receipt pool is missing")
          expect(pools).toHaveLength(1)
          expect(pool.quantity.toFixed()).toBe("8")
          expect(pool.valueMinor?.toString()).toBe("2500")
          expect(
            await db.financeInventoryValuationEvent.count({
              where: { bookId: book.id },
            }),
          ).toBe(4)
          expect(
            await db.stockMovement.count({
              where: { operation: { tenantId: tenant.id } },
            }),
          ).toBe(4)
          expect(
            (
              await db.financeBook.findUniqueOrThrow({ where: { id: book.id } })
            ).lastSequence.toString(),
          ).toBe("25")
          for (const label of [
            "Recognition corrected",
            "Recognition transit-correction",
            "Recognition receipt-first",
          ]) {
            const document = docs.find(
              (doc) => doc.costBill.description === label,
            )
            if (!document)
              throw new Error(`Missing retained correction ${label}`)
            const correction = document.events.find(
              (event) => event.reversalOfId !== null,
            )
            const original = document.events.find(
              (event) => event.id === correction?.reversalOfId,
            )
            if (!correction || !original)
              throw new Error(`Missing exact correction linkage ${label}`)
            expect(correction.journalEntry.reversalOfId).toBe(
              original.journalEntryId,
            )
            for (const line of original.journalEntry.lines)
              expect(correction.journalEntry.lines).toContainEqual(
                expect.objectContaining({
                  accountId: line.accountId,
                  debitMinor: line.creditMinor,
                  creditMinor: line.debitMinor,
                }),
              )
          }
          console.log(
            `supplier-recognition resume ${run}: retained final source/stock/value/correction reconciliation clear`,
          )
          const invoice = {
            ...context,
            recognitionId: root.id,
            stage: "INVOICE" as const,
            invoiceAmountMinor: "200",
            reference: "Guarded resume invoice",
            effectiveAt: day(2),
            clientCommandId: `resume-invoice-${run}`,
          }
          await expect(
            recognizeFinancePurchase(db, {
              ...invoice,
              effectiveAt: new Date("2025-12-31T12:00:00Z"),
            }),
          ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
          await db.financeBook.update({
            where: { id: book.id },
            data: { closedThrough: day(3) },
          })
          await expect(
            recognizeFinancePurchase(db, invoice),
          ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
          await db.financeBook.update({
            where: { id: book.id },
            data: { closedThrough: null },
          })
          await expect(
            getFinancePurchaseRecognition(db, {
              ...context,
              tenantId: `foreign-${run}`,
              recognitionId: invoiceFirst.id,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" })
          const other = await createFinanceSupplier(db, {
            ...context,
            clientCommandId: `resume-other-${run}`,
            code: "OTHER",
            name: "Other owned QA supplier",
          })
          await expect(
            db.$transaction(
              async (tx) => {
                await tx.financePurchaseRecognition.update({
                  where: { id: invoiceFirst.id },
                  data: { supplierId: other.id },
                })
                throw new Error(
                  "Unexpected foreign supplier FK acceptance; rollback",
                )
              },
              { maxWait: 10_000, timeout: 30_000 },
            ),
          ).rejects.toMatchObject({ code: "P2003" })
          const statement = await getFinanceSupplierStatement(db, {
            ...context,
            supplierId: invoiceFirst.supplierId,
          })
          expect(statement.payableMinor).toBe("1500")
          expect(statement.advanceMinor).toBe("0")
          const purchases = await listFinancePurchaseBills(db, context)
          expect(purchases.items.map((row) => row.id).sort()).toEqual(
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
          console.log(
            `supplier-recognition resume ${run}: remaining date/scope/FK/statement/list guards clear`,
          )
        } finally {
          await cleanupPurchaseRecognitionTest(db, {
            run,
            tenantId: tenant.id,
            actorUserId: user.id,
            bookId: book.id,
            items,
          })
        }
      },
      240_000,
    )
  },
)
