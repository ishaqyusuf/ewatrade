import { expect } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { getFinanceSupplierOpeningReview } from "./supplier-opening-review"
import {
  createFinanceSupplierInTransaction,
  prepareReviewedFinanceSupplierOpeningInTransaction,
  recordFinanceSupplierOpeningInTransaction,
} from "./supplier-writes"
/** Canonical supplier and opening are created only in the owned QA transaction; everything rolls back. */
export async function verifySupplierOpeningRollback(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    kind: "PAYABLE" | "ADVANCE"
    amountMinor: string
    clientCommandId: string
  },
) {
  await db.tenant.findFirstOrThrow({
    where: { id: input.tenantId, dataClassification: "QA" },
  })
  await db.membership.findFirstOrThrow({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      role: { in: ["OWNER", "ADMIN"] },
      status: "ACTIVE",
    },
  })
  const book = await db.financeBook.findFirstOrThrow({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  const facts = async () => ({
    suppliers: await db.financeSupplierAccount.findMany({
      where: { bookId: input.bookId },
      orderBy: { id: "asc" },
    }),
    commands: await db.financeCommand.count({
      where: { bookId: input.bookId },
    }),
    journals: await db.financeJournalEntry.count({
      where: { bookId: input.bookId },
    }),
    entries: await db.financeSupplierEntry.count({
      where: { bookId: input.bookId },
    }),
    payments: await db.financeBillPayment.count({
      where: { bookId: input.bookId },
    }),
    allocations: await db.financeSupplierAllocation.count({
      where: { bookId: input.bookId },
    }),
    releases: await db.financeSupplierAllocationRelease.count({
      where: { bookId: input.bookId },
    }),
    bills: await db.financeBill.findMany({
      where: { bookId: input.bookId },
      select: {
        id: true,
        totalMinor: true,
        paidMinor: true,
        voidedAt: true,
        voidEffectiveAt: true,
        voidReason: true,
      },
      orderBy: { id: "asc" },
    }),
    events: await db.financePurchaseRecognitionEvent.count({
      where: { bookId: input.bookId },
    }),
    receipts: await db.financePurchaseReceiptLine.count({
      where: { bookId: input.bookId },
    }),
    valuation: await db.financeInventoryValuationEvent.count({
      where: { bookId: input.bookId },
    }),
    sequence: (
      await db.financeBook.findUniqueOrThrow({
        where: { id: input.bookId },
        select: { lastSequence: true },
      })
    ).lastSequence.toString(),
    balances: await db.financeJournalLine.groupBy({
      by: ["accountId"],
      where: { bookId: input.bookId },
      _sum: { debitMinor: true, creditMinor: true },
      orderBy: { accountId: "asc" },
    }),
    stock: (
      await db.stockBalanceSource.findMany({
        where: { tenantId: input.tenantId },
        select: {
          id: true,
          revision: true,
          onHandQuantity: true,
          reservedQuantity: true,
        },
        orderBy: { id: "asc" },
      })
    ).map((s) => ({
      ...s,
      onHandQuantity: s.onHandQuantity.toFixed(),
      reservedQuantity: s.reservedQuantity.toFixed(),
    })),
  })
  const before = await facts(),
    started = performance.now()
  let failure: unknown,
    review:
      | Awaited<ReturnType<typeof getFinanceSupplierOpeningReview>>
      | undefined,
    advisoryMs = 0
  try {
    await db.$transaction(
      async (tx) => {
        const supplier = await createFinanceSupplierInTransaction(tx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          bookId: input.bookId,
          clientCommandId: input.clientCommandId + "-supplier",
          name: "QA opening rollback supplier",
          code: "QA-OPEN-" + crypto.randomUUID().slice(0, 20).toUpperCase(),
        })
        const owned = {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          bookId: input.bookId,
          supplierId: supplier.id,
          kind: input.kind,
          amountMinor: input.amountMinor,
          description: " QA canonical opening rollback ",
        }
        const advisoryStarted = performance.now()
        review = await getFinanceSupplierOpeningReview(tx, owned)
        advisoryMs = performance.now() - advisoryStarted
        const prepared =
          await prepareReviewedFinanceSupplierOpeningInTransaction(tx, owned)
        expect(prepared.review).toEqual(review)
        const nativeInput = {
          ...owned,
          effectiveAt: new Date(book.startsAt),
          clientCommandId: input.clientCommandId,
        }
        owned.amountMinor = "999"
        owned.description = "changed after preparation"
        owned.supplierId = "caller-mutated"
        const result = await prepared.execute(input.clientCommandId)
        expect(await prepared.execute(input.clientCommandId)).toEqual(result)
        expect(() =>
          prepared.execute(input.clientCommandId + "-other"),
        ).toThrow("one command")
        const entry = await tx.financeSupplierEntry.findUniqueOrThrow({
          where: { id: result.id },
          include: { journalEntry: { include: { lines: true } } },
        })
        expect(entry).toMatchObject({
          bookId: input.bookId,
          supplierId: supplier.id,
          kind: `OPENING_${input.kind}`,
          side: input.kind === "PAYABLE" ? "CREDIT" : "DEBIT",
          amountMinor: BigInt(input.amountMinor),
          description: "QA canonical opening rollback",
          effectiveAt: book.startsAt,
          actorUserId: input.actorUserId,
          moneyAccountId: null,
          billId: null,
          reversalOfId: null,
        })
        expect(entry.journalEntry).toMatchObject({
          bookId: input.bookId,
          sourceKind: `SUPPLIER_OPENING_${input.kind}`,
          sourceId: supplier.id,
          description: "QA canonical opening rollback",
          effectiveAt: book.startsAt,
          actorUserId: input.actorUserId,
          reversalOfId: null,
        })
        expect(
          entry.journalEntry.lines
            .map((l) => ({
              accountId: l.accountId,
              debitMinor: l.debitMinor.toString(),
              creditMinor: l.creditMinor.toString(),
            }))
            .sort((a, b) => a.accountId.localeCompare(b.accountId)),
        ).toEqual(
          prepared.review.lines.map(
            ({ accountId, debitMinor, creditMinor }) => ({
              accountId,
              debitMinor,
              creditMinor,
            }),
          ),
        )
        expect(
          await recordFinanceSupplierOpeningInTransaction(tx, nativeInput),
        ).toEqual(result)
        await expect(
          getFinanceSupplierOpeningReview(tx, { ...nativeInput }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        await expect(
          recordFinanceSupplierOpeningInTransaction(tx, {
            ...nativeInput,
            clientCommandId: input.clientCommandId + "-duplicate",
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(
          await tx.financeSupplierEntry.count({
            where: {
              bookId: input.bookId,
              supplierId: supplier.id,
              kind: `OPENING_${input.kind}`,
            },
          }),
        ).toBe(1)
        throw Error("OWNED_SUPPLIER_OPENING_ROLLBACK")
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    failure = error
  }
  const transactionMs = performance.now() - started
  expect(failure instanceof Error ? failure.message : String(failure)).toBe(
    "OWNED_SUPPLIER_OPENING_ROLLBACK",
  )
  expect(await facts()).toEqual(before)
  if (!review) throw Error("Verified canonical opening review required")
  return {
    kind: input.kind,
    review,
    advisoryMs,
    transactionMs,
    rollbackVerified: true,
    originalSupplierAndAllFactsUnchanged: true,
    nativeReplay: true,
    duplicateKindRefused: true,
    privateInputSnapshot: true,
    otherCommandRefused: true,
  }
}
