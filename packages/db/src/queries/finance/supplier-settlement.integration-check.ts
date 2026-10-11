import { expect } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { recordFinanceSupplierAdvanceInTransaction } from "./supplier-writes"
import { getFinanceSupplierAdvanceReview } from "./supplier-advance-review"
import {
  allocateFinanceSupplierAdvanceInTransaction,
  getFinanceSupplierAllocationReview,
  getFinancePurchasePaymentReview,
  payFinancePurchaseBillInTransaction,
} from "./purchase-settlements"

/** Caller supplies an exact classified QA Book/supplier/invoice/account. Every attempted effect rolls back. */
export async function verifySupplierSettlementRollback(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    supplierId: string
    billId: string
    moneyAccountId: string
    effectiveAt: Date
  },
) {
  await db.tenant.findFirstOrThrow({
    where: { id: input.tenantId, dataClassification: "QA" },
  })
  await db.membership.findFirstOrThrow({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
  })
  await db.financeBook.findFirstOrThrow({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  await db.financeBill.findFirstOrThrow({
    where: {
      id: input.billId,
      bookId: input.bookId,
      supplierId: input.supplierId,
      kind: "PURCHASE",
      voidedAt: null,
    },
  })
  const facts = async () => ({
    journal: await db.financeJournalEntry.count({
      where: { bookId: input.bookId },
    }),
    command: await db.financeCommand.count({ where: { bookId: input.bookId } }),
    entries: await db.financeSupplierEntry.count({
      where: { bookId: input.bookId },
    }),
    payments: await db.financeBillPayment.count({
      where: { bookId: input.bookId },
    }),
    allocations: await db.financeSupplierAllocation.count({
      where: { bookId: input.bookId },
    }),
    receipts: await db.financePurchaseReceiptLine.count({
      where: { bookId: input.bookId },
    }),
    valuation: await db.financeInventoryValuationEvent.count({
      where: { bookId: input.bookId },
    }),
    paid: (
      await db.financeBill.findUniqueOrThrow({
        where: { id: input.billId },
        select: { paidMinor: true },
      })
    ).paidMinor.toString(),
    sequence: (
      await db.financeBook.findUniqueOrThrow({
        where: { id: input.bookId },
        select: { lastSequence: true },
      })
    ).lastSequence.toString(),
  })
  const before = await facts()
  const results: Array<{ kind: string; ms: number }> = []
  for (const kind of ["advance", "allocation", "payment"] as const) {
    const at = performance.now()
    let failure: unknown
    try {
      await db.$transaction(
        async (tx) => {
          const base = {
            ...input,
            clientCommandId: crypto.randomUUID(),
            amountMinor: "250",
            description: "QA rollback partial supplier settlement",
          }
          if (kind === "advance") {
            const review = await getFinanceSupplierAdvanceReview(tx, base)
            const result = await recordFinanceSupplierAdvanceInTransaction(
              tx,
              base,
            )
            const entry = await tx.financeSupplierEntry.findUniqueOrThrow({
              where: { id: result.id },
              include: { journalEntry: { include: { lines: true } } },
            })
            expect(entry).toMatchObject({
              supplierId: input.supplierId,
              kind: "ADVANCE",
              side: "DEBIT",
              amountMinor: 250n,
              moneyAccountId: input.moneyAccountId,
            })
            expect(review.unallocatedAddedMinor).toBe("250")
            expect(entry.journalEntry.sourceKind).toBe("SUPPLIER_ADVANCE")
            expect(
              entry.journalEntry.lines
                .map((l) => ({
                  id: l.accountId,
                  debit: l.debitMinor.toString(),
                  credit: l.creditMinor.toString(),
                }))
                .sort((a, b) => a.id.localeCompare(b.id)),
            ).toEqual(
              [
                { id: review.advanceAccountId, debit: "250", credit: "0" },
                { id: input.moneyAccountId, debit: "0", credit: "250" },
              ].sort((a, b) => a.id.localeCompare(b.id)),
            )
            expect(
              await recordFinanceSupplierAdvanceInTransaction(tx, base),
            ).toEqual(result)
          } else if (kind === "allocation") {
            const advance = await recordFinanceSupplierAdvanceInTransaction(
              tx,
              { ...base, amountMinor: "700" },
            )
            const allocationInput = {
              ...base,
              clientCommandId: crypto.randomUUID(),
              advanceEntryId: advance.id,
            }
            const review = await getFinanceSupplierAllocationReview(
              tx,
              allocationInput,
            )
            const result = await allocateFinanceSupplierAdvanceInTransaction(
              tx,
              allocationInput,
            )
            const row = await tx.financeSupplierAllocation.findUniqueOrThrow({
              where: { id: result.id },
              include: {
                supplierEntry: {
                  include: { journalEntry: { include: { lines: true } } },
                },
              },
            })
            expect(row).toMatchObject({
              billId: input.billId,
              supplierId: input.supplierId,
              advanceEntryId: advance.id,
              amountMinor: 250n,
            })
            expect(review.advanceBeforeMinor).toBe("700")
            expect(review.advanceAfterMinor).toBe("450")
            expect(row.supplierEntry.journalEntry.sourceKind).toBe(
              "SUPPLIER_ADVANCE_ALLOCATION",
            )
            expect(
              row.supplierEntry.journalEntry.lines
                .map((l) => ({
                  id: l.accountId,
                  debit: l.debitMinor.toString(),
                  credit: l.creditMinor.toString(),
                }))
                .sort((a, b) => a.id.localeCompare(b.id)),
            ).toEqual(
              [
                { id: review.payableAccountId, debit: "250", credit: "0" },
                { id: review.advanceAccountId, debit: "0", credit: "250" },
              ].sort((a, b) => a.id.localeCompare(b.id)),
            )
            expect(
              await allocateFinanceSupplierAdvanceInTransaction(
                tx,
                allocationInput,
              ),
            ).toEqual(result)
            expect(
              (
                await tx.financeBill.findUniqueOrThrow({
                  where: { id: input.billId },
                  select: { paidMinor: true },
                })
              ).paidMinor.toString(),
            ).toBe(review.paidAfterMinor)
          } else {
            const review = await getFinancePurchasePaymentReview(tx, base)
            const result = await payFinancePurchaseBillInTransaction(tx, base)
            const payment = await tx.financeBillPayment.findUniqueOrThrow({
              where: { id: result.id },
              include: {
                supplierEntry: {
                  include: { journalEntry: { include: { lines: true } } },
                },
              },
            })
            expect(payment).toMatchObject({
              bookId: input.bookId,
              billId: input.billId,
              accountId: input.moneyAccountId,
              amountMinor: 250n,
            })
            expect(payment.supplierEntry?.journalEntry.sourceKind).toBe(
              "PURCHASE_PAYMENT",
            )
            expect(
              payment.supplierEntry?.journalEntry.lines
                .map((l) => ({
                  id: l.accountId,
                  debit: l.debitMinor.toString(),
                  credit: l.creditMinor.toString(),
                }))
                .sort((a, b) => a.id.localeCompare(b.id)),
            ).toEqual(
              [
                { id: review.payableAccountId, debit: "250", credit: "0" },
                { id: input.moneyAccountId, debit: "0", credit: "250" },
              ].sort((a, b) => a.id.localeCompare(b.id)),
            )
            expect(
              (
                await tx.financeBill.findUniqueOrThrow({
                  where: { id: input.billId },
                  select: { paidMinor: true },
                })
              ).paidMinor.toString(),
            ).toBe(review.paidAfterMinor)
            expect(await payFinancePurchaseBillInTransaction(tx, base)).toEqual(
              result,
            )
          }
          throw Error("SUPPLIER_SETTLEMENT_ROLLBACK")
        },
        { maxWait: 10_000, timeout: 30_000 },
      )
    } catch (error) {
      failure = error
    }
    expect(failure instanceof Error ? failure.message : String(failure)).toBe(
      "SUPPLIER_SETTLEMENT_ROLLBACK",
    )
    expect(await facts()).toEqual(before)
    results.push({ kind, ms: performance.now() - at })
  }
  return { results, before, rollbackVerified: true }
}
