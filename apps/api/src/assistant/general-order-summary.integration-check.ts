import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { getCommercialOrderOperationalSummary } from "@ewatrade/db/queries"
import { ordersRouter } from "../trpc/routers/orders"
import type { GeneralContext } from "./general-context"

/** Isolated fixture rows only: exercises SQL aggregation without result-page limits. */
export async function verifyOperationalOrderSummary(ctx: GeneralContext) {
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id ?? ""
  const actor = ctx.session.user.id
  const customer = await ctx.db.customer.create({
    data: { tenantId, name: "Summary QA" },
  })
  const start = new Date("2026-01-01T00:00:00Z")
  const end = new Date("2026-01-02T00:00:00Z")
  const base = {
    tenantId,
    storeId,
    customerId: customer.id,
    createdByUserId: actor,
    currencyCode: "NGN",
    subtotalMinor: 1000,
    totalMinor: 1000,
    payloadHash: "qa",
    createdAt: start,
  }
  const rows = await ctx.db.commercialOrder.createManyAndReturn({
    data: [
      {
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: "SUMMARY-1",
        amountPaidMinor: 200,
      },
      {
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: "SUMMARY-2",
        paymentStatus: "PAID",
      },
      {
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: "SUMMARY-3",
        currencyCode: "USD",
        totalMinor: 500,
        subtotalMinor: 500,
      },
      {
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: "SUMMARY-4",
        status: "CANCELLED",
      },
      {
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: "SUMMARY-5",
        status: "REFUNDED",
      },
      {
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: "SUMMARY-6",
        createdAt: end,
      },
      {
        ...base,
        clientOrderId: randomUUID(),
        orderNumber: "SUMMARY-7",
        createdByUserId: "other-rep",
      },
    ],
  })
  const scope = {
    tenantId,
    storeId,
    customerId: customer.id,
    createdByUserId: actor,
    createdAfter: start,
    createdBefore: end,
  }
  await ctx.db.store.update({
    where: { id: storeId },
    data: { salesRepOrderVisibility: "OWN_SALES" },
  })
  const routerInput = {
    storeId,
    customerId: customer.id,
    createdAfter: start,
    createdBefore: end,
  }
  expect(
    (await ordersRouter.createCaller(ctx).operationalSummary(routerInput))
      .orderCount,
  ).toBe("6")
  const rep: GeneralContext = {
    ...ctx,
    tenantContext: {
      ...ctx.tenantContext,
      membership: { ...ctx.tenantContext.membership, role: "CASHIER" },
    },
  }
  expect(
    (await ordersRouter.createCaller(rep).operationalSummary(routerInput))
      .orderCount,
  ).toBe("5")
  const pageInput = {
    storeId,
    createdAfter: start,
    createdBefore: end,
    limit: 2,
  }
  const first = await ordersRouter.createCaller(rep).listPage(pageInput)
  const second = await ordersRouter
    .createCaller(rep)
    .listPage({ ...pageInput, cursor: first.nextCursor })
  expect(first.items).toHaveLength(2)
  expect(second.items).toHaveLength(2)
  expect(
    new Set([...first.items, ...second.items].map((row) => row.id)).size,
  ).toBe(4)
  const foreignOrder = rows.find((row) => row.createdByUserId === "other-rep")
  if (!foreignOrder) throw Error("Foreign actor fixture missing")
  await expect(
    ordersRouter
      .createCaller(rep)
      .listPage({ ...pageInput, cursor: foreignOrder.id }),
  ).rejects.toThrow("list changed")
  expect(
    (
      await ordersRouter
        .createCaller(rep)
        .listPage({ ...pageInput, statuses: ["CANCELLED"] })
    ).items.map((row) => row.status),
  ).toEqual(["CANCELLED"])
  const summary = await getCommercialOrderOperationalSummary(ctx.db, scope)
  expect(summary).toEqual({
    complete: true,
    orderCount: "5",
    outstandingCount: "2",
    currencies: [
      {
        currencyCode: "NGN",
        orderCount: "4",
        orderValueMinor: "4000",
        outstandingCount: "1",
        outstandingMinor: "800",
      },
      {
        currencyCode: "USD",
        orderCount: "1",
        orderValueMinor: "500",
        outstandingCount: "1",
        outstandingMinor: "500",
      },
    ],
  })
  expect(
    (
      await getCommercialOrderOperationalSummary(ctx.db, {
        ...scope,
        createdByUserId: undefined,
      })
    ).orderCount,
  ).toBe("6")
  expect(
    (
      await getCommercialOrderOperationalSummary(ctx.db, {
        ...scope,
        createdBefore: undefined,
      })
    ).orderCount,
  ).toBe("6")
  expect(
    (
      await getCommercialOrderOperationalSummary(ctx.db, {
        ...scope,
        customerId: "not-this-customer",
      })
    ).orderCount,
  ).toBe("0")
  expect(
    (
      await getCommercialOrderOperationalSummary(ctx.db, {
        ...scope,
        storeId: "other-store",
      })
    ).orderCount,
  ).toBe("0")
  expect(
    (
      await getCommercialOrderOperationalSummary(ctx.db, {
        ...scope,
        tenantId: "other-tenant",
      })
    ).orderCount,
  ).toBe("0")
  expect(
    (
      await getCommercialOrderOperationalSummary(ctx.db, {
        ...scope,
        statuses: ["CANCELLED"],
      })
    ).outstandingCount,
  ).toBe("0")
  await expect(
    getCommercialOrderOperationalSummary(ctx.db, {
      ...scope,
      createdAfter: end,
    }),
  ).rejects.toThrow("End must follow start")
  const legacy = rows.find((row) => row.orderNumber === "SUMMARY-2")
  if (!legacy) throw Error("Fixture missing")
  await ctx.db.commercialOrderPayment.create({
    data: {
      tenantId,
      storeId,
      orderId: legacy.id,
      clientPaymentId: randomUUID(),
      amountMinor: 1000,
      type: "REFUND",
      method: "CASH",
      recordedByUserId: actor,
    },
  })
  expect(
    (await getCommercialOrderOperationalSummary(ctx.db, scope)).currencies[0]
      ?.outstandingMinor,
  ).toBe("1800")
}
