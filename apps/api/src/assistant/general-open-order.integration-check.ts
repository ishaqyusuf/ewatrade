import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { ordersRouter } from "../trpc/routers/orders"
import type { GeneralContext } from "./general-context"

export async function verifyOpenOrderPages(ctx: GeneralContext) {
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("QA fixture required")
  const customer = await ctx.db.customer.create({
    data: {
      tenantId,
      name: "Open order QA",
      phone: "+2348000000000",
      normalizedPhone: "+2348000000000",
    },
  })
  const base = {
    tenantId,
    storeId,
    customerId: customer.id,
    createdByUserId: ctx.session.user.id,
    currencyCode: "NGN",
    subtotalMinor: 100,
    totalMinor: 100,
    payloadHash: "qa",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }
  const rows = await ctx.db.commercialOrder.createManyAndReturn({
    data: [
      ...Array.from({ length: 51 }, (_, i) => ({
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: `OPEN-${i}`,
      })),
      {
        ...base,
        createdByUserId: "other-rep",
        clientOrderId: randomUUID(),
        orderNumber: "OPEN-OTHER",
      },
      {
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: "CLOSED",
        status: "COMPLETED",
        paymentStatus: "PAID",
        amountPaidMinor: 100,
        completedAt: new Date(),
      },
      {
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: "CANCELLED",
        status: "CANCELLED",
      },
      {
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: "REFUNDED",
        status: "REFUNDED",
      },
    ],
  })
  await ctx.db.store.update({
    where: { id: storeId },
    data: { salesRepOrderVisibility: "OWN_SALES" },
  })
  const rep: GeneralContext = {
    ...ctx,
    tenantContext: {
      ...ctx.tenantContext,
      membership: { ...ctx.tenantContext.membership, role: "CASHIER" },
    },
  }
  const caller = ordersRouter.createCaller(rep)
  const seen: string[] = []
  let cursor: string | undefined
  do {
    const page = await caller.lookupOpenPage({
      customerId: customer.id,
      limit: 10,
      cursor,
    })
    seen.push(...page.items.map((row) => row.id))
    cursor = page.nextCursor
    if (seen.length > 60) throw Error("Pagination did not terminate")
  } while (cursor)
  expect(seen).toHaveLength(51)
  expect(new Set(seen).size).toBe(51)
  const other = rows.find((row) => row.orderNumber === "OPEN-OTHER")
  if (!other) throw Error("Other actor missing")
  expect(seen).not.toContain(other.id)
  await expect(
    caller.lookupOpenPage({ customerId: customer.id, cursor: other.id }),
  ).rejects.toThrow("lookup changed")
  expect(
    (await caller.lookupOpenPage({ orderNumber: "OPEN-OTHER" })).items,
  ).toEqual([])
  expect(await caller.lookupOpen({ orderNumber: "OPEN-OTHER" })).toHaveLength(1)
  expect(
    (
      await ordersRouter
        .createCaller(ctx)
        .lookupOpenPage({ orderNumber: "OPEN-OTHER" })
    ).items,
  ).toHaveLength(1)
  expect(
    (await caller.lookupOpenPage({ orderNumber: "CLOSED" })).items,
  ).toHaveLength(1)
  expect(
    (await caller.lookupOpenPage({ phone: "+234 8000000000" })).items,
  ).toHaveLength(10)
}
