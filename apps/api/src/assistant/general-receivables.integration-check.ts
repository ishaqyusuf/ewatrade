import { expect } from "bun:test"
import { customerLedgerRouter } from "../trpc/routers/customer-ledger"
import type { GeneralContext } from "./general-context"

export async function verifyReceivables(ctx: GeneralContext) {
  const tenantId = ctx.tenantContext.tenant.id
  if (ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("QA fixture required")
  const ids: string[] = []
  try {
    for (let i = 0; i < 12; i++) {
      const customer = await ctx.db.customer.create({
        data: { tenantId, name: i === 11 ? "Literal 100%" : `Receivable ${i}` },
      })
      const account = await ctx.db.customerLedgerAccount.create({
        data: {
          tenantId,
          customerId: customer.id,
          currencyCode: i === 1 ? "USD" : "NGN",
          lastSequence: i === 0 ? 2n : 0n,
        },
      })
      ids.push(account.id)
    }
    await ctx.db.customerLedgerEntry.createMany({
      data: [
        {
          side: "DEBIT" as const,
          amountMinor: 9007199254740993n,
          sequence: 1n,
          kind: "OPENING_DEBT" as const,
        },
        {
          side: "CREDIT" as const,
          amountMinor: 200n,
          sequence: 2n,
          kind: "OPENING_CREDIT" as const,
        },
      ].map((row) => ({
        ...row,
        tenantId,
        accountId: ids[0]!,
        sourceKind: "QA",
        sourceId: `${ids[0]}-${row.sequence}`,
        actorUserId: ctx.session.user.id,
        effectiveAt: new Date(),
        description: "Owned integration fixture",
      })),
    })
    const owner: GeneralContext = {
      ...ctx,
      tenantContext: {
        ...ctx.tenantContext,
        tenant: { ...ctx.tenantContext.tenant, retailOpsPlanId: "pro" },
      },
    }
    const caller = customerLedgerRouter.createCaller(owner)
    const first = await caller.receivables({ limit: 10 })
    const second = await caller.receivables({
      limit: 10,
      cursor: first.nextCursor!,
    })
    expect(first.items).toHaveLength(10)
    expect(second.items).toHaveLength(2)
    expect(
      new Set([...first.items, ...second.items].map((row) => row.id)).size,
    ).toBe(12)
    expect(second.nextCursor).toBeNull()
    expect(first.items[0]?.totals.outstandingDebtMinor).toBe("9007199254740993")
    expect(first.items[0]?.totals.availableCreditMinor).toBe("200")
    expect(first.items[1]?.currencyCode).toBe("USD")
    expect((await caller.receivables({ query: "%" })).items).toHaveLength(1)
    await expect(
      caller.receivables({ query: "%", cursor: first.nextCursor! }),
    ).rejects.toThrow("list changed")
    await expect(caller.receivables({ cursor: "foreign" })).rejects.toThrow(
      "list changed",
    )
    const rep: GeneralContext = {
      ...owner,
      tenantContext: {
        ...owner.tenantContext,
        membership: { ...owner.tenantContext.membership, role: "CASHIER" },
      },
    }
    await expect(
      customerLedgerRouter.createCaller(rep).receivables({}),
    ).rejects.toThrow("Owners and Admins")
    const free: GeneralContext = {
      ...owner,
      tenantContext: {
        ...owner.tenantContext,
        tenant: { ...owner.tenantContext.tenant, retailOpsPlanId: "free" },
      },
    }
    await expect(
      customerLedgerRouter.createCaller(free).receivables({}),
    ).rejects.toThrow()
  } finally {
    await ctx.db.customerLedgerEntry.deleteMany({
      where: { tenantId, accountId: { in: ids } },
    })
    await ctx.db.customerLedgerAccount.deleteMany({
      where: { tenantId, id: { in: ids } },
    })
  }
}
