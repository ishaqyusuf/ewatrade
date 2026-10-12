import { expect } from "bun:test"
import type { Prisma } from "@ewatrade/db"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  generalProposalForApp,
} from "./general-proposals"

/** Only the guarded owned pending draft persists; every attempted business write is rolled back. */
export async function verifyDirectPurchaseProposalRollback(
  ctx: GeneralContext,
  proposalId: string,
) {
  const db = ctx.db,
    tenantId = ctx.tenantContext.tenant.id,
    storeId = ctx.tenantContext.activeStore?.id
  await db.tenant.findFirstOrThrow({
    where: { id: tenantId, dataClassification: "QA" },
  })
  const row = await db.assistantActionProposal.findFirstOrThrow({
    where: {
      id: proposalId,
      tenantId,
      actorUserId: ctx.session.user.id,
      storeId,
      status: "PENDING",
    },
  })
  const app = generalProposalForApp(row)
  if (
    app.payload.action !== "purchase_record" ||
    !app.approvalToken ||
    !storeId
  )
    throw Error("Exact pending signed direct purchase proposal required")
  const payload = app.payload,
    bookId = payload.bookId
  await db.financeBook.findFirstOrThrow({ where: { id: bookId, tenantId } })
  await db.financeSupplierAccount.findFirstOrThrow({
    where: { id: payload.supplierId, bookId, actorUserId: ctx.session.user.id },
  })
  const facts = async () => {
    const [r] = await db.$queryRaw<
      Array<{ facts: unknown }>
    >`SELECT jsonb_build_object(
    'book',(SELECT to_jsonb(b) FROM "FinanceBook" b WHERE b.id=${bookId} AND b."tenantId"=${tenantId}),
    'bills',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM "FinanceBill" b WHERE b."bookId"=${bookId}),
    'billLines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM "FinanceBillLine" l WHERE l."bookId"=${bookId}),
    'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "FinanceCommand" c WHERE c."bookId"=${bookId}),
    'journals',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM "FinanceJournalEntry" j WHERE j."bookId"=${bookId}),
    'journalLines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM "FinanceJournalLine" l WHERE l."bookId"=${bookId}),
    'supplierEntries',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "FinanceSupplierEntry" e WHERE e."bookId"=${bookId}),
    'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "FinanceBillPayment" p WHERE p."bookId"=${bookId}),
    'allocations',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "FinanceSupplierAllocation" a WHERE a."bookId"=${bookId}),
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "FinancePurchaseReceiptLine" r WHERE r."bookId"=${bookId}),
    'valuations',(SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM "FinanceInventoryValuationEvent" v WHERE v."bookId"=${bookId}),
    'pools',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "FinanceInventoryPool" p WHERE p."bookId"=${bookId}),
    'stock',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "StockBalanceSource" s WHERE s."tenantId"=${tenantId}),
    'operations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM "StockOperation" o WHERE o."tenantId"=${tenantId}),
    'movements',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "StockMovement" m JOIN "StockBalanceSource" s ON s.id=m."balanceSourceId" WHERE s."tenantId"=${tenantId}),
    'categoryNames',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "StockOperationCategoryName" c WHERE c."tenantId"=${tenantId}),
    'categoryLinks',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "StockOperationCategory" c WHERE c."tenantId"=${tenantId}),
    'proposal',(SELECT to_jsonb(p) FROM "AssistantActionProposal" p WHERE p.id=${proposalId})
  ) AS facts`
    return r!.facts
  }
  const before = await facts(),
    calls: Array<{ operation: string; ms: number }> = []
  const reports = []
  for (const mode of ["completion", "stale-stock"] as const) {
    let injected = false,
      staleMutation = false,
      receipt: unknown = null,
      failure: unknown = null
    const transaction = (tx: Prisma.TransactionClient) =>
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
          if (typeof value === "function")
            return wrap(target, value, String(key))
          if (
            value &&
            typeof value === "object" &&
            !String(key).startsWith("$")
          )
            return new Proxy(value, {
              get(delegate, method) {
                const fn = Reflect.get(delegate, method)
                if (typeof fn !== "function") return fn
                return wrap(
                  delegate,
                  async (...args: any[]) => {
                    if (
                      key === "assistantActionProposal" &&
                      method === "update" &&
                      args[0]?.data?.status === "COMPLETED"
                    ) {
                      receipt = args[0].data.executedResult
                      expect(receipt).toMatchObject({
                        kind: "finance_purchase_bill",
                        bookId,
                        title: "Received purchase recorded",
                      })
                      const recordId = (receipt as { recordId: string })
                        .recordId
                      if (typeof recordId !== "string" || !recordId)
                        throw Error("Exact owning purchase receipt required")
                      const bill = await tx.financeBill.findFirstOrThrow({
                        where: {
                          id: recordId,
                          bookId,
                          supplierId: payload.supplierId,
                          storeId,
                          actorUserId: ctx.session.user.id,
                          kind: "PURCHASE",
                        },
                      })
                      const total = payload.lines.reduce(
                        (sum, l) => sum + BigInt(l.amountMinor),
                        0n,
                      )
                      expect(bill.totalMinor).toBe(total)
                      expect(bill.paidMinor).toBe(0n)
                      expect(bill.incurredAt.toISOString()).toBe(
                        payload.incurredAt,
                      )
                      expect(bill.dueAt?.toISOString()).toBe(payload.dueAt)
                      const [r] = await tx.$queryRaw<
                        Array<{ proof: any }>
                      >`SELECT jsonb_build_object(
       'goods',(SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object('receipt',to_jsonb(r),'movement',to_jsonb(m),'operation',to_jsonb(o),'valuation',to_jsonb(v),
       'categories',(SELECT jsonb_agg(jsonb_build_object('name',n.name,'position',c.position) ORDER BY c.position) FROM "StockOperationCategory" c JOIN "StockOperationCategoryName" n ON n.id=c."categoryNameId" WHERE c."stockOperationId"=o.id)) ORDER BY l.position)
        FROM "FinanceBillLine" l JOIN "FinancePurchaseReceiptLine" r ON r."billLineId"=l.id JOIN "StockMovement" m ON m.id=r."stockMovementId" JOIN "StockOperation" o ON o.id=r."stockOperationId" JOIN "FinanceInventoryValuationEvent" v ON v."purchaseReceiptId"=r.id WHERE l."billId"=${recordId} AND l."bookId"=${bookId}),
       'journal',(SELECT to_jsonb(j)||jsonb_build_object('lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l."accountId") FROM "FinanceJournalLine" l WHERE l."entryId"=j.id)) FROM "FinanceJournalEntry" j WHERE j."bookId"=${bookId} AND j."sourceKind"='PURCHASE_BILL' AND j."sourceId"=${recordId}),
       'supplierEntry',(SELECT to_jsonb(e) FROM "FinanceSupplierEntry" e WHERE e."bookId"=${bookId} AND e."billId"=${recordId})
      ) AS proof`
                      const proof = r!.proof
                      expect(proof.goods).toHaveLength(payload.lines.length)
                      for (let i = 0; i < payload.lines.length; i++) {
                        const l = payload.lines[i]!,
                          g = proof.goods[i]
                        expect(g).toMatchObject({
                          bookId,
                          billId: recordId,
                          position: i,
                          amountMinor: Number(l.amountMinor),
                          description: l.description,
                        })
                        expect(g.receipt).toMatchObject({
                          tenantId,
                          bookId,
                          billLineId: g.id,
                          stockOperationId: g.operation.id,
                          stockMovementId: g.movement.id,
                        })
                        expect(g.movement).toMatchObject({
                          balanceSourceId: l.balanceSourceId,
                          enteredInventoryUnitId: l.enteredInventoryUnitId,
                          configurationVersionId:
                            l.expectedConfigurationVersionId,
                          enteredQuantity: Number(l.enteredQuantity),
                        })
                        expect(g.operation).toMatchObject({
                          tenantId,
                          storeId,
                          actorUserId: ctx.session.user.id,
                          type: "RECEIPT",
                          source: "finance_purchase",
                        })
                        expect(g.valuation).toMatchObject({
                          tenantId,
                          bookId,
                          balanceSourceId: l.balanceSourceId,
                          actorUserId: ctx.session.user.id,
                          sourceCostMinor: Number(l.amountMinor),
                          sourceKind: "PURCHASE_RECEIPT",
                          sourceId: g.receipt.id,
                          purchaseReceiptId: g.receipt.id,
                          stockOperationId: g.operation.id,
                          stockMovementId: g.movement.id,
                        })
                        expect(g.categories).toEqual(
                          l.categories.map((c, position) => {
                            if (!("name" in c))
                              throw Error("Named QA categories required")
                            return { name: c.name.toLowerCase(), position }
                          }),
                        )
                      }
                      expect(proof.journal).toMatchObject({
                        bookId,
                        storeId,
                        actorUserId: ctx.session.user.id,
                        sourceKind: "PURCHASE_BILL",
                        sourceId: recordId,
                      })
                      expect(proof.journal.lines).toHaveLength(2)
                      expect(
                        proof.journal.lines.reduce(
                          (s: number, l: any) => s + l.debitMinor,
                          0,
                        ),
                      ).toBe(Number(total))
                      expect(
                        proof.journal.lines.reduce(
                          (s: number, l: any) => s + l.creditMinor,
                          0,
                        ),
                      ).toBe(Number(total))
                      expect(proof.supplierEntry).toMatchObject({
                        bookId,
                        billId: recordId,
                        supplierId: payload.supplierId,
                        journalEntryId: proof.journal.id,
                        actorUserId: ctx.session.user.id,
                        kind: "PURCHASE_BILL",
                        side: "CREDIT",
                        amountMinor: Number(total),
                      })
                      injected = true
                      throw Error("DIRECT_PURCHASE_COMPLETION_ROLLBACK")
                    }
                    return fn.apply(delegate, args)
                  },
                  `${String(key)}.${String(method)}`,
                )
              },
            })
          return value
        },
      })
    const proxyDb = new Proxy(db, {
      get(target, key) {
        if (key === "$transaction")
          return <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
            options?: Parameters<typeof db.$transaction>[1],
          ) =>
            target.$transaction(async (tx) => {
              if (mode === "stale-stock") {
                const l = payload.lines.at(-1)!
                const changed = await tx.stockBalanceSource.updateMany({
                  where: {
                    id: l.balanceSourceId,
                    tenantId,
                    storeId,
                    revision: l.expectedBalanceRevision,
                  },
                  data: { revision: { increment: 1 } },
                })
                expect(changed.count).toBe(1)
                staleMutation = true
              }
              const result = await run(transaction(tx))
              throw Error("DIRECT_PURCHASE_GUARD_DID_NOT_REFUSE")
            }, options)
        const value = Reflect.get(target, key)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const started = performance.now(),
      callStart = calls.length
    try {
      await decideGeneralProposal(
        { ...ctx, db: proxyDb },
        {
          proposalId,
          revision: app.revision,
          decision: "confirm",
          approvalToken: app.approvalToken,
        },
      )
    } catch (e) {
      failure =
        e instanceof Error
          ? {
              name: e.name,
              message: e.message,
              code: (e as { code?: string }).code,
            }
          : String(e)
    }
    const elapsedMs = performance.now() - started
    expect(await facts()).toEqual(before)
    if (mode === "completion") {
      expect(injected).toBe(true)
      expect(failure).toMatchObject({
        message: "DIRECT_PURCHASE_COMPLETION_ROLLBACK",
      })
    } else {
      expect(staleMutation).toBe(true)
      expect(injected).toBe(false)
      expect(failure).toMatchObject({ code: "CONFLICT" })
      expect((failure as { message: string }).message).toContain(
        "Refresh the purchase stock configuration and revision",
      )
    }
    reports.push({
      mode,
      elapsedMs,
      injected,
      staleMutation,
      failure,
      receipt,
      calls: calls.slice(callStart),
      savedFactsUnchanged: true,
    })
  }
  return {
    proposalId,
    lines: payload.lines.length,
    categories: payload.lines.reduce((s, l) => s + l.categories.length, 0),
    signedApprovalUsed: true,
    pending: true,
    rollbackVerified: true,
    reports,
  }
}
