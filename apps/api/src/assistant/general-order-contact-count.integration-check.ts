import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { countCommercialOrderCustomers } from "@ewatrade/db/queries"
import { ordersRouter } from "../trpc/routers/orders"
import type { GeneralContext } from "./general-context"

export async function verifyOrderContactCount(ctx: GeneralContext) {
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("QA fixture required")
  const snapshots = [
    { customerEmail: " A@EXAMPLE.INVALID ", customerName: "First" },
    { customerEmail: "a@example.invalid", customerName: "Renamed" },
    { customerPhone: "+234 (800) 000-0000", customerName: "Phone" },
    { customerPhone: "+2348000000000", customerName: "Changed" },
    { customerName: " AMINA " },
    { customerName: "amina" },
    { customerName: "   ", customerEmail: " ", customerPhone: "() -" },
    {},
    { customerName: "Cancelled contact", status: "CANCELLED" as const },
    { customerName: "Refunded contact", status: "REFUNDED" as const },
    { customerName: "Other rep", createdByUserId: "other-rep" },
  ]
  await ctx.db.commercialOrder.createMany({
    data: snapshots.map((snapshot) => ({
      tenantId,
      storeId,
      createdByUserId: ctx.session.user.id,
      clientOrderId: randomUUID(),
      orderNumber: randomUUID(),
      currencyCode: "NGN",
      subtotalMinor: 100,
      totalMinor: 100,
      payloadHash: "qa",
      ...snapshot,
    })),
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
  expect(await ordersRouter.createCaller(ctx).customerCount()).toBe(6)
  expect(await ordersRouter.createCaller(rep).customerCount()).toBe(5)
  expect(
    await countCommercialOrderCustomers(ctx.db, { tenantId: "foreign" }),
  ).toBe(0)
  expect(
    await countCommercialOrderCustomers(ctx.db, {
      tenantId,
      storeId: "foreign",
    }),
  ).toBe(0)
  await ctx.db.store.update({
    where: { id: storeId },
    data: { salesRepOrderVisibility: "ALL_STORE_ORDERS" },
  })
  expect(await ordersRouter.createCaller(rep).customerCount()).toBe(6)
}
