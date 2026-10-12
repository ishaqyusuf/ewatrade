import { expect } from "bun:test"
import type { Prisma } from "@ewatrade/db"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  generalProposalForApp,
} from "./general-proposals"

/** Guarded caller owns the QA proposal; only the pending draft persists. All attempted business effects roll back. */
export async function verifySupplierSettlementProposalRollback(
  ctx: GeneralContext,
  proposalId: string,
) {
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  if (
    !(await db.tenant.findFirst({
      where: { id: tenantId, dataClassification: "QA" },
      select: { id: true },
    }))
  )
    throw Error("Classified owned QA context required")
  const row = await db.assistantActionProposal.findFirstOrThrow({
    where: {
      id: proposalId,
      tenantId,
      actorUserId: ctx.session.user.id,
      storeId: ctx.tenantContext.activeStore?.id,
      status: "PENDING",
    },
  })
  const app = generalProposalForApp(row)
  if (
    app.payload.action !== "supplier_advance" &&
    app.payload.action !== "supplier_advance_allocate" &&
    app.payload.action !== "purchase_payment" &&
    app.payload.action !== "supplier_allocation_release" &&
    app.payload.action !== "purchase_payment_reverse" &&
    app.payload.action !== "purchase_recognition_reverse"
  )
    throw Error("An exact pending supplier settlement proposal is required")
  const bookId = app.payload.bookId
  const billId =
    "billId" in app.payload
      ? app.payload.billId
      : app.payload.action === "supplier_allocation_release"
        ? (
            await db.financeSupplierAllocation.findFirstOrThrow({
              where: {
                id: app.payload.allocationId,
                bookId: app.payload.bookId,
              },
              select: { billId: true },
            })
          ).billId
        : app.payload.action === "purchase_payment_reverse"
          ? (
              await db.financeBillPayment.findFirstOrThrow({
                where: {
                  id: app.payload.paymentId,
                  bookId: app.payload.bookId,
                },
                select: { billId: true },
              })
            ).billId
          : app.payload.action === "purchase_recognition_reverse"
            ? (
                await db.financePurchaseRecognitionEvent.findFirstOrThrow({
                  where: {
                    id: app.payload.eventId,
                    bookId,
                    recognitionId: app.payload.recognitionId,
                  },
                  select: { invoiceBillId: true },
                })
              ).invoiceBillId
            : null
  await db.financeBook.findFirstOrThrow({
    where: { id: bookId, tenantId },
    select: { id: true },
  })
  const facts = async () => ({
    events: await db.financePurchaseRecognitionEvent.count({
      where: { bookId },
    }),
    bills: await db.financeBill.count({ where: { bookId, kind: "PURCHASE" } }),
    journals: await db.financeJournalEntry.count({ where: { bookId } }),
    receipts: await db.financePurchaseReceiptLine.count({ where: { bookId } }),
    valuation: await db.financeInventoryValuationEvent.count({
      where: { bookId },
    }),
    commands: await db.financeCommand.count({ where: { bookId } }),
    supplierEntries: await db.financeSupplierEntry.count({ where: { bookId } }),
    payments: await db.financeBillPayment.count({ where: { bookId } }),
    paymentReversals: await db.financeBillPayment.findMany({
      where: { bookId },
      select: {
        id: true,
        reversedAt: true,
        reversalEffectiveAt: true,
        reversedById: true,
        reversalReason: true,
      },
      orderBy: { id: "asc" },
    }),
    allocations: await db.financeSupplierAllocation.count({
      where: { bookId },
    }),
    releases: await db.financeSupplierAllocationRelease.count({
      where: { bookId },
    }),
    paid: billId
      ? (
          await db.financeBill.findFirstOrThrow({
            where: { id: billId, bookId },
            select: { paidMinor: true },
          })
        ).paidMinor.toString()
      : null,
    purchaseBills: (
      await db.financeBill.findMany({
        where: { bookId, kind: "PURCHASE" },
        select: {
          id: true,
          totalMinor: true,
          paidMinor: true,
          voidedAt: true,
          voidEffectiveAt: true,
          voidedById: true,
          voidReason: true,
        },
        orderBy: { id: "asc" },
      })
    ).map((bill) => ({
      ...bill,
      totalMinor: bill.totalMinor.toString(),
      paidMinor: bill.paidMinor.toString(),
    })),
    bookSequence: (
      await db.financeBook.findFirstOrThrow({
        where: { id: bookId, tenantId },
        select: { lastSequence: true },
      })
    ).lastSequence.toString(),
    purchaseFacts: await db.financePurchaseRecognitionEvent.findMany({
      where: { bookId },
      select: {
        id: true,
        recognitionId: true,
        stage: true,
        reversalOfId: true,
        journalEntryId: true,
        effectiveAt: true,
        reason: true,
      },
      orderBy: { id: "asc" },
    }),
    storeLabels: await db.store.findMany({
      where: { tenantId, id: row.storeId ?? undefined },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
    stock: (
      await db.stockBalanceSource.findMany({
        where: { tenantId, storeId: row.storeId ?? undefined },
        select: {
          id: true,
          revision: true,
          onHandQuantity: true,
          reservedQuantity: true,
        },
        orderBy: { id: "asc" },
      })
    ).map((stock) => ({
      ...stock,
      onHandQuantity: stock.onHandQuantity.toFixed(),
      reservedQuantity: stock.reservedQuantity.toFixed(),
    })),
  })
  const before = await facts()
  let injected = false
  const calls: Array<{ operation: string; ms: number }> = []
  const transaction = (tx: Prisma.TransactionClient) =>
    new Proxy(tx, {
      get(target, key) {
        const value = Reflect.get(target, key)
        if (typeof value === "function")
          return async (...args: unknown[]) => {
            const start = performance.now()
            try {
              return await value.apply(target, args)
            } finally {
              calls.push({
                operation: String(key),
                ms: performance.now() - start,
              })
            }
          }
        if (value && typeof value === "object" && !String(key).startsWith("$"))
          return new Proxy(value, {
            get(delegate, method) {
              const fn = Reflect.get(delegate, method)
              if (typeof fn !== "function") return fn
              return async (...args: unknown[]) => {
                const start = performance.now()
                try {
                  const write = args[0] as
                    | Prisma.AssistantActionProposalUpdateArgs
                    | undefined
                  if (
                    key === "assistantActionProposal" &&
                    method === "update" &&
                    write?.data.status === "COMPLETED"
                  ) {
                    injected = true
                    expect(write.data.executedResult).toMatchObject({
                      kind:
                        app.payload.action === "supplier_advance"
                          ? "finance_supplier"
                          : app.payload.action ===
                              "purchase_recognition_reverse"
                            ? "finance_purchase_registration"
                            : "finance_purchase_bill",
                      recordId:
                        app.payload.action === "supplier_advance"
                          ? app.payload.supplierId
                          : app.payload.action ===
                              "purchase_recognition_reverse"
                            ? app.payload.recognitionId
                            : billId,
                      bookId,
                    })
                    throw Error("SUPPLIER_PROPOSAL_ROLLBACK")
                  }
                  return await fn.apply(delegate, args)
                } finally {
                  calls.push({
                    operation: `${String(key)}.${String(method)}`,
                    ms: performance.now() - start,
                  })
                }
              }
            },
          })
        return value
      },
    })
  const failingDb = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return <T>(
          run: (tx: Prisma.TransactionClient) => Promise<T>,
          options?: Parameters<typeof db.$transaction>[1],
        ) => target.$transaction((tx) => run(transaction(tx)), options)
      const value = Reflect.get(target, key)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
  const start = performance.now()
  let failure: { name: string; message: string } | null = null
  try {
    await decideGeneralProposal(
      { ...ctx, db: failingDb },
      {
        proposalId,
        revision: app.revision,
        decision: "confirm",
        approvalToken: app.approvalToken,
      },
    )
  } catch (error) {
    failure =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "Unknown", message: String(error) }
  }
  const elapsedMs = performance.now() - start
  const after = await facts()
  const pending =
    (
      await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: proposalId },
      })
    ).status === "PENDING"
  expect(injected).toBe(true)
  expect(failure?.message).toBe("SUPPLIER_PROPOSAL_ROLLBACK")
  expect(after).toEqual(before)
  expect(pending).toBe(true)
  let staleProof: { elapsedMs: number; savedFactsUnchanged: boolean } | null =
    null
  if (
    (app.payload.action === "supplier_allocation_release" ||
      app.payload.action === "purchase_payment_reverse") &&
    billId
  ) {
    const changedDb = new Proxy(db, {
      get(target, key) {
        if (key === "$transaction")
          return <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
            options?: Parameters<typeof db.$transaction>[1],
          ) =>
            target.$transaction(async (tx) => {
              const changed = await tx.financeBill.updateMany({
                where: { id: billId, bookId, paidMinor: { gt: 0n } },
                data: { paidMinor: { decrement: 1n } },
              })
              expect(changed.count).toBe(1)
              await run(tx)
              throw Error("STALE_SETTLEMENT_DID_NOT_REFUSE")
            }, options)
        const value = Reflect.get(target, key)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const staleStarted = performance.now()
    let staleFailure: unknown
    try {
      await decideGeneralProposal(
        { ...ctx, db: changedDb },
        {
          proposalId,
          revision: app.revision,
          decision: "confirm",
          approvalToken: app.approvalToken,
        },
      )
    } catch (error) {
      staleFailure = error
    }
    expect(staleFailure).toMatchObject({ code: "CONFLICT" })
    expect(
      staleFailure instanceof Error
        ? staleFailure.message
        : String(staleFailure),
    ).toContain("Review again")
    expect(await facts()).toEqual(before)
    staleProof = {
      elapsedMs: performance.now() - staleStarted,
      savedFactsUnchanged: true,
    }
  }
  if (app.payload.action === "purchase_recognition_reverse") {
    if (!row.storeId) throw Error("Exact owning Store required")
    const changedDb = new Proxy(db, {
      get(target, key) {
        if (key === "$transaction")
          return <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
            options?: Parameters<typeof db.$transaction>[1],
          ) =>
            target.$transaction(async (tx) => {
              const store = await tx.store.findFirstOrThrow({
                where: { id: row.storeId!, tenantId },
              })
              await tx.store.update({
                where: { id: store.id },
                data: { name: store.name + " QA stale review" },
              })
              await run(tx)
              throw Error("STALE_PURCHASE_FACT_DID_NOT_REFUSE")
            }, options)
        const value = Reflect.get(target, key)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const staleStarted = performance.now()
    let staleFailure: unknown
    try {
      await decideGeneralProposal(
        { ...ctx, db: changedDb },
        {
          proposalId,
          revision: app.revision,
          decision: "confirm",
          approvalToken: app.approvalToken,
        },
      )
    } catch (error) {
      staleFailure = error
    }
    expect(staleFailure).toMatchObject({ code: "CONFLICT" })
    expect(
      staleFailure instanceof Error
        ? staleFailure.message
        : String(staleFailure),
    ).toContain("Review again")
    expect(await facts()).toEqual(before)
    staleProof = {
      elapsedMs: performance.now() - staleStarted,
      savedFactsUnchanged: true,
    }
  }
  const operations: Record<string, { calls: number; ms: number }> = {}
  for (const call of calls) {
    const group = (operations[call.operation] ??= { calls: 0, ms: 0 })
    group.calls++
    group.ms += call.ms
  }
  return {
    injected,
    elapsedMs,
    failure,
    pending,
    before,
    after,
    operations: Object.fromEntries(
      Object.entries(operations).sort((a, b) => b[1].ms - a[1].ms),
    ),
    rollbackVerified: true,
    staleProof,
  }
}
