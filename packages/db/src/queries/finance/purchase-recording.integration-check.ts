import { expect } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { lockFinanceBook } from "./access"
import type { FinancePurchaseReviewInput } from "./purchase-recording-review"
import {
  getFinancePurchaseRecordingReview,
  financePurchaseRecordingReviewDigest,
} from "./purchase-recording-review"
import {
  prepareReviewedFinancePurchaseRecordingInTransaction,
  recordFinancePurchaseInTransaction,
} from "./purchases"

// Prisma stores these timestamps in UTC without a SQL timezone; raw JSON omits Z.
const utc = (value: string) =>
  new Date(value.endsWith("Z") ? value : value + "Z").toISOString()
const json = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))
async function captureDirectPurchaseFacts(
  db: PrismaClient,
  input: FinancePurchaseReviewInput,
) {
  const facts = async () => {
    const [snapshot] = await db.$queryRaw<Array<{ facts: unknown }>>`
      SELECT jsonb_build_object(
        'book', (SELECT to_jsonb(b) FROM "FinanceBook" b WHERE b.id=${input.bookId} AND b."tenantId"=${input.tenantId}),
        'bills', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM "FinanceBill" b WHERE b."bookId"=${input.bookId}),
        'commands', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "FinanceCommand" c WHERE c."bookId"=${input.bookId}),
        'journals', (SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM "FinanceJournalEntry" j WHERE j."bookId"=${input.bookId}),
        'journalLines', (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM "FinanceJournalLine" l WHERE l."bookId"=${input.bookId}),
        'supplierEntries', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "FinanceSupplierEntry" e WHERE e."bookId"=${input.bookId}),
        'receipts', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "FinancePurchaseReceiptLine" r WHERE r."bookId"=${input.bookId}),
        'valuations', (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM "FinanceInventoryValuationEvent" v WHERE v."bookId"=${input.bookId}),
        'pools', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "FinanceInventoryPool" p WHERE p."bookId"=${input.bookId}),
        'stock', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "StockBalanceSource" s WHERE s."tenantId"=${input.tenantId}),
        'operations', (SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM "StockOperation" o WHERE o."tenantId"=${input.tenantId}),
        'categories', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "StockOperationCategoryName" c WHERE c."tenantId"=${input.tenantId})
      ) AS facts`
    return snapshot!.facts
  }
  return facts()
}
/** Exact owned QA sources only. No fixture cleanup or persistent business writes. */
export async function verifyDirectPurchaseRecordingRollback(
  db: PrismaClient,
  input: FinancePurchaseReviewInput,
  clientCommandId: string,
) {
  await db.tenant.findFirstOrThrow({
    where: { id: input.tenantId, dataClassification: "QA" },
  })
  await db.membership.findFirstOrThrow({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      role: "OWNER",
      status: "ACTIVE",
    },
  })
  const facts = () => captureDirectPurchaseFacts(db, input)
  const before = await facts()
  const advisoryStarted = performance.now(),
    review = await getFinancePurchaseRecordingReview(db, input),
    advisoryMs = performance.now() - advisoryStarted
  const expectedReviewDigest = financePurchaseRecordingReviewDigest(review)
  const calls: Array<{ operation: string; ms: number }> = []
  const traced = (tx: any) =>
    new Proxy(tx, {
      get(target, key) {
        const value = Reflect.get(target, key)
        const wrap =
          (owner: any, fn: any, name: string) =>
          async (...args: any[]) => {
            const started = performance.now()
            try {
              return await fn.apply(owner, args)
            } finally {
              calls.push({ operation: name, ms: performance.now() - started })
            }
          }
        if (typeof value === "function") return wrap(target, value, String(key))
        if (value && typeof value === "object" && !String(key).startsWith("$"))
          return new Proxy(value, {
            get(model, operation) {
              const fn = Reflect.get(model, operation)
              return typeof fn === "function"
                ? wrap(model, fn, `${String(key)}.${String(operation)}`)
                : fn
            },
          })
        return value
      },
    })
  let completed = false,
    savedBillId: string | undefined,
    failure: unknown
  const started = performance.now()
  try {
    await db.$transaction(
      async (tx) => {
        const owned = structuredClone(input),
          original = structuredClone(input)
        const prepared =
          await prepareReviewedFinancePurchaseRecordingInTransaction(
            traced(tx),
            owned,
            expectedReviewDigest,
          )
        expect(prepared.review).toEqual(review)
        owned.supplierId = "mutated"
        owned.incurredAt.setFullYear(2999)
        owned.lines[0]!.amountMinor = "999"
        owned.lines[0]!.categories[0] = { name: "mutated" }
        const result = await prepared.execute(clientCommandId)
        savedBillId = result.id
        expect(await prepared.execute(clientCommandId)).toEqual(result)
        expect(() => prepared.execute(clientCommandId + "-other")).toThrow(
          "bound to one command",
        )
        expect(
          await recordFinancePurchaseInTransaction(traced(tx), {
            ...original,
            clientCommandId,
          }),
        ).toEqual(result)
        await expect(
          recordFinancePurchaseInTransaction(traced(tx), {
            ...original,
            clientCommandId,
            description: "changed command",
          }),
        ).rejects.toThrow("different details")
        const [actual] = await tx.$queryRaw<Array<{ saved: any }>>`
        SELECT jsonb_build_object(
          'bill',(SELECT to_jsonb(b) FROM "FinanceBill" b WHERE b.id=${result.id} AND b."bookId"=${input.bookId}),
          'goods',(SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object(
            'receipt',to_jsonb(r),'movement',to_jsonb(m),'operation',to_jsonb(o),'valuation',to_jsonb(v),'pool',to_jsonb(p),
            'categories',(SELECT jsonb_agg(jsonb_build_object('name',c.name,'position',oc.position) ORDER BY oc.position) FROM "StockOperationCategory" oc JOIN "StockOperationCategoryName" c ON c.id=oc."categoryNameId" WHERE oc."stockOperationId"=o.id)
          ) ORDER BY l.position)
          FROM "FinanceBillLine" l
          JOIN "FinancePurchaseReceiptLine" r ON r."billLineId"=l.id
          JOIN "StockMovement" m ON m.id=r."stockMovementId"
          JOIN "StockOperation" o ON o.id=r."stockOperationId"
          JOIN "FinanceInventoryValuationEvent" v ON v."purchaseReceiptId"=r.id
          JOIN "FinanceInventoryPool" p ON p.id=v."poolId"
          WHERE l."billId"=${result.id} AND l."bookId"=${input.bookId}),
          'journal',(SELECT to_jsonb(j)||jsonb_build_object('lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l."accountId") FROM "FinanceJournalLine" l WHERE l."entryId"=j.id)) FROM "FinanceJournalEntry" j WHERE j."bookId"=${input.bookId} AND j."sourceKind"='PURCHASE_BILL' AND j."sourceId"=${result.id}),
          'entries',(SELECT jsonb_agg(to_jsonb(e)) FROM "FinanceSupplierEntry" e WHERE e."bookId"=${input.bookId} AND e."billId"=${result.id}),
          'commands',(SELECT jsonb_agg(to_jsonb(c)) FROM "FinanceCommand" c WHERE c."bookId"=${input.bookId} AND c."clientCommandId"=${clientCommandId})
        ) AS saved`
        const a = actual!.saved
        expect(a.bill).toMatchObject({
          id: result.id,
          bookId: input.bookId,
          kind: "PURCHASE",
          supplierId: input.supplierId,
          storeId: input.storeId,
          actorUserId: input.actorUserId,
          totalMinor: Number(review.totalMinor),
          paidMinor: 0,
          voidedAt: null,
          description: review.description,
          reference: review.reference,
        })
        expect(utc(a.bill.incurredAt)).toBe(review.incurredAt)
        expect(a.bill.dueAt ? utc(a.bill.dueAt) : null).toEqual(review.dueAt)
        expect(a.goods).toHaveLength(input.lines.length)
        for (let i = 0; i < input.lines.length; i++) {
          const g = a.goods[i],
            r = review.goods[i]!,
            line = input.lines[i]!
          expect(g.position).toBe(i)
          expect(g.amountMinor).toBe(Number(r.amountMinor))
          expect(g.accountId).toBe(review.journal[0]!.accountId)
          expect(g.receipt).toMatchObject({
            tenantId: input.tenantId,
            bookId: input.bookId,
            billLineId: g.id,
            stockOperationId: g.operation.id,
            stockMovementId: g.movement.id,
          })
          expect(g.operation).toMatchObject({
            tenantId: input.tenantId,
            storeId: input.storeId,
            actorUserId: input.actorUserId,
            type: "RECEIPT",
            source: "finance_purchase",
          })
          expect(utc(g.operation.effectiveAt)).toBe(review.incurredAt)
          expect(g.movement).toMatchObject({
            balanceSourceId: line.balanceSourceId,
            enteredInventoryUnitId: line.enteredInventoryUnitId,
            configurationVersionId: line.expectedConfigurationVersionId,
            enteredQuantity: Number(r.enteredQuantity),
            signedCanonicalEffect: Number(r.stock.canonicalQuantity),
            previousOnHandQuantity: Number(r.stock.before),
            resultingOnHandQuantity: Number(r.stock.after),
          })
          expect(g.categories).toHaveLength(10)
          expect(g.valuation).toMatchObject({
            tenantId: input.tenantId,
            bookId: input.bookId,
            balanceSourceId: line.balanceSourceId,
            actorUserId: input.actorUserId,
            kind: "PURCHASE_RECEIPT",
            sourceKind: "PURCHASE_RECEIPT",
            sourceId: g.receipt.id,
            purchaseReceiptId: g.receipt.id,
            stockOperationId: g.operation.id,
            stockMovementId: g.movement.id,
            sourceCostMinor: Number(r.amountMinor),
            valueAfterMinor:
              r.valuation.valueAfterMinor === null
                ? null
                : Number(r.valuation.valueAfterMinor),
            unknownReason: r.valuation.unknownReason,
            sequence: Number(r.valuation.nextSequence),
            quantityBefore: Number(r.valuation.quantityBefore),
            canonicalEffect: Number(r.valuation.canonicalEffect),
            quantityAfter: Number(r.valuation.quantityAfter),
          })
          expect(utc(g.valuation.effectiveAt)).toBe(review.incurredAt)
          expect(g.pool).toMatchObject({
            tenantId: input.tenantId,
            bookId: input.bookId,
            balanceSourceId: line.balanceSourceId,
            lastStockRevision: line.expectedBalanceRevision + 1,
            lastMovementCount: r.valuation.observedMovementCount + 1,
            lastSequence: Number(r.valuation.nextSequence),
            quantity: Number(r.valuation.quantityAfter),
            valueMinor:
              r.valuation.valueAfterMinor === null
                ? null
                : Number(r.valuation.valueAfterMinor),
          })
        }
        expect(a.journal).toMatchObject({
          bookId: input.bookId,
          storeId: input.storeId,
          actorUserId: input.actorUserId,
          sourceKind: "PURCHASE_BILL",
          sourceId: result.id,
        })
        expect(utc(a.journal.effectiveAt)).toBe(review.incurredAt)
        expect(a.journal.lines).toHaveLength(2)
        for (const l of review.journal)
          expect(
            a.journal.lines.find((x: any) => x.accountId === l.accountId),
          ).toMatchObject({
            debitMinor: Number(l.debitMinor),
            creditMinor: Number(l.creditMinor),
          })
        expect(a.entries).toHaveLength(1)
        expect(a.entries[0]).toMatchObject({
          kind: "PURCHASE_BILL",
          side: "CREDIT",
          bookId: input.bookId,
          supplierId: input.supplierId,
          billId: result.id,
          journalEntryId: a.journal.id,
          actorUserId: input.actorUserId,
          amountMinor: Number(review.totalMinor),
        })
        expect(a.commands).toHaveLength(1)
        expect(a.commands[0]).toMatchObject({
          kind: "RECORD_PURCHASE",
          result: { id: result.id },
          actorUserId: input.actorUserId,
        })
        completed = true
        throw Error("QA_DIRECT_PURCHASE_ROLLBACK")
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (e) {
    if (!(e instanceof Error && e.message === "QA_DIRECT_PURCHASE_ROLLBACK"))
      failure =
        e instanceof Error ? { name: e.name, message: e.message } : String(e)
  }
  const transactionMs = performance.now() - started,
    after = await facts(),
    rollbackVerified = json(before) === json(after)
  const report = {
    completed,
    rollbackVerified,
    advisoryMs,
    transactionMs,
    lines: input.lines.length,
    categories: input.lines.length * 10,
    savedBillId,
    expectedReviewDigest,
    failure,
    review,
    calls,
  }
  expect(rollbackVerified).toBe(true)
  if (!completed) throw Object.assign(Error(json(report)), { report })
  return report
}

/** Authentic advisory digest must refuse every changed source, with all changes rolled back. */
export async function verifyDirectPurchaseReviewRefusals(
  db: PrismaClient,
  input: FinancePurchaseReviewInput,
) {
  await db.tenant.findFirstOrThrow({
    where: { id: input.tenantId, dataClassification: "QA" },
  })
  await db.membership.findFirstOrThrow({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      role: "OWNER",
      status: "ACTIVE",
    },
  })
  const before = await captureDirectPurchaseFacts(db, input)
  const review = await getFinancePurchaseRecordingReview(db, input),
    digest = financePurchaseRecordingReviewDigest(review)
  const results = []
  for (const kind of [
    "supplier-label",
    "stock-revision",
    "pool-sequence",
    "category-resolution",
  ] as const) {
    const started = performance.now()
    let refused = false
    try {
      await db.$transaction(
        async (tx) => {
          await lockFinanceBook(tx, input)
          if (kind === "supplier-label")
            await tx.financeSupplierAccount.update({
              where: { id: input.supplierId },
              data: { name: "QA changed direct purchase source" },
            })
          else if (kind === "stock-revision")
            await tx.stockBalanceSource.update({
              where: { id: input.lines[0]!.balanceSourceId },
              data: { revision: { increment: 1 } },
            })
          else if (kind === "pool-sequence")
            await tx.financeInventoryPool.update({
              where: {
                bookId_balanceSourceId: {
                  bookId: input.bookId,
                  balanceSourceId: input.lines[0]!.balanceSourceId,
                },
              },
              data: { lastSequence: { increment: 1 } },
            })
          else {
            const selector = input.lines[0]!.categories[0]!
            if (!("name" in selector))
              throw Error("Named fresh-category QA source required")
            await tx.stockOperationCategoryName.create({
              data: {
                tenantId: input.tenantId,
                name: selector.name,
                normalizedName: selector.name.toLowerCase(),
              },
            })
          }
          await expect(
            prepareReviewedFinancePurchaseRecordingInTransaction(
              tx,
              input,
              digest,
            ),
          ).rejects.toMatchObject({ code: "CONFLICT" })
          refused = true
          throw Error("QA_DIRECT_PURCHASE_STALE_ROLLBACK")
        },
        { maxWait: 10_000, timeout: 30_000 },
      )
    } catch (e) {
      if (
        !(
          e instanceof Error &&
          e.message === "QA_DIRECT_PURCHASE_STALE_ROLLBACK"
        )
      )
        throw e
    }
    expect(refused).toBe(true)
    results.push({ kind, refused, transactionMs: performance.now() - started })
  }
  expect(json(await captureDirectPurchaseFacts(db, input))).toBe(json(before))
  return { results, rollbackVerified: true, expectedReviewDigest: digest }
}
