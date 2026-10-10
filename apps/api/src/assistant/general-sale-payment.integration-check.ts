import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { createSimpleCatalogItem } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  draftGeneralProposal,
  decideGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

export async function verifySalePayment(
  ctx: GeneralContext,
  failingDb: GeneralContext["db"],
  conversationId: string,
) {
  ctx = { ...ctx, requestHeaders: new Headers(ctx.requestHeaders) }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const tenantId = ctx.tenantContext.tenant.id,
    storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("QA fixture required")
  const item = await createSimpleCatalogItem(ctx.db, {
    tenantId,
    storeId,
    actorUserId: ctx.session.user.id,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Paid sale QA",
    canonicalUnitName: "Piece",
    priceMinor: 100,
  })
  const offering = await ctx.db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
    include: {
      productUnitOffering: {
        include: { inventoryUnit: { include: { configurationVersion: true } } },
      },
    },
  })
  const unit = offering.productUnitOffering?.inventoryUnit
  if (!unit) throw Error("Unit missing")
  await ctx.db.stockBalanceSource.create({
    data: {
      tenantId,
      storeId,
      productId: unit.configurationVersion.productId,
      variantId: offering.variantId,
      inventoryUnitId: unit.id,
      kind: "SHARED_POOL",
      onHandQuantity: "10",
    },
  })
  const customer = await ctx.db.customer.create({
    data: {
      tenantId,
      name: "Sale customer QA",
      email: "sale-customer@example.invalid",
    },
  })
  const payload = {
    customerId: customer.id,
    action: "order_create" as const,
    lines: [
      { offeringId: offering.id, quantity: "2", expectedFixedPriceMinor: 100 },
    ],
    initialPayment: {
      amountMinor: 150,
      method: "cash" as const,
      note: "Received at sale",
    },
  }
  const draft = await draftGeneralProposal(ctx, conversationId, payload)
  const row = await ctx.db.assistantActionProposal.findUniqueOrThrow({
    where: { id: draft.proposalId },
  })
  const app = generalProposalForApp(row)
  const reviewed = await generalProposalWithReview(ctx, row)
  expect(reviewed.review).toContain("Record received: NGN 1.50 · cash")
  expect(reviewed.review).toContain("Remaining balance: NGN 0.50")
  const command = {
    proposalId: app.id,
    revision: app.revision,
    decision: "confirm" as const,
    approvalToken: app.approvalToken,
  }
  await expect(
    decideGeneralProposal({ ...ctx, db: failingDb }, command),
  ).rejects.toThrow("Injected receipt failure")
  expect(await ctx.db.commercialOrder.count({ where: { tenantId } })).toBe(0)
  expect(
    await ctx.db.commercialOrderPayment.count({ where: { tenantId } }),
  ).toBe(0)
  const result = await decideGeneralProposal(ctx, command)
  expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(
    result.receipt,
  )
  expect(await ctx.db.commercialOrder.count({ where: { tenantId } })).toBe(1)
  expect(
    await ctx.db.commercialOrderPayment.count({ where: { tenantId } }),
  ).toBe(1)
  const order = await ctx.db.commercialOrder.findFirstOrThrow({
    where: { tenantId },
  })
  expect(order.customerId).toBe(customer.id)
  expect(order.customerName).toBe(customer.name)
  expect(order.customerEmail).toBe(customer.email)
  expect(order.totalMinor).toBe(200)
  expect(order.amountPaidMinor).toBe(150)
  expect(result.receipt?.detail).toContain("remaining 0.50")
  await expect(
    draftGeneralProposal(ctx, conversationId, {
      ...payload,
      initialPayment: { ...payload.initialPayment, amountMinor: 201 },
    }),
  ).rejects.toThrow("exceeds")
  await ctx.db.membership.update({
    where: { id: ctx.tenantContext.membership.id },
    data: { role: "CASHIER" },
  })
  try {
    await expect(
      draftGeneralProposal(ctx, conversationId, payload),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  } finally {
    await ctx.db.membership.update({
      where: { id: ctx.tenantContext.membership.id },
      data: { role: ctx.tenantContext.membership.role },
    })
  }
  // Roadmap B gate: review price change, then two items with300 received.
  const priceDraft = await draftGeneralProposal(ctx, conversationId, {
    action: "product_price_update",
    offeringId: offering.id,
    priceMinor: 20000,
    reason: "B gate reviewed price",
  })
  const priceApp = generalProposalForApp(
    await ctx.db.assistantActionProposal.findUniqueOrThrow({
      where: { id: priceDraft.proposalId },
    }),
  )
  await decideGeneralProposal(ctx, {
    proposalId: priceApp.id,
    revision: priceApp.revision,
    decision: "confirm",
    approvalToken: priceApp.approvalToken,
  })
  const gateDraft = await draftGeneralProposal(ctx, conversationId, {
    ...payload,
    lines: [
      {
        offeringId: offering.id,
        quantity: "2",
        expectedFixedPriceMinor: 20000,
      },
    ],
    initialPayment: { amountMinor: 30000, method: "cash" },
  })
  const gateApp = generalProposalForApp(
    await ctx.db.assistantActionProposal.findUniqueOrThrow({
      where: { id: gateDraft.proposalId },
    }),
  )
  const gateResult = await decideGeneralProposal(ctx, {
    proposalId: gateApp.id,
    revision: gateApp.revision,
    decision: "confirm",
    approvalToken: gateApp.approvalToken,
  })
  const gateOrder = await ctx.db.commercialOrder.findUniqueOrThrow({
    where: { id: gateResult.receipt!.recordId },
  })
  expect(gateOrder.totalMinor).toBe(40000)
  expect(gateOrder.amountPaidMinor).toBe(30000)
  expect(gateResult.receipt?.detail).toContain("remaining 100.00")
  await ctx.db.sellableOffering.update({
    where: { id: offering.id },
    data: { pricingPolicy: "ORDER_TOTAL", fixedPriceMinor: null },
  })
  const totalDraft = await draftGeneralProposal(ctx, conversationId, {
    action: "order_create",
    lines: [{ offeringId: offering.id, quantity: "3", enteredTotalMinor: 175 }],
  })
  const totalRow = await ctx.db.assistantActionProposal.findUniqueOrThrow({
    where: { id: totalDraft.proposalId },
  })
  const totalReview = await generalProposalWithReview(ctx, totalRow)
  expect(
    totalReview.review?.some((line) =>
      line.includes("entered item total 1.75"),
    ),
  ).toBe(true)
  const totalApp = generalProposalForApp(totalRow)
  const totalResult = await decideGeneralProposal(ctx, {
    proposalId: totalApp.id,
    revision: totalApp.revision,
    decision: "confirm",
    approvalToken: totalApp.approvalToken,
  })
  const totalOrder = await ctx.db.commercialOrder.findUniqueOrThrow({
    where: { id: totalResult.receipt!.recordId },
  })
  expect(totalOrder.totalMinor).toBe(175)
  expect(totalOrder.amountPaidMinor).toBe(0)
  expect(
    (
      await ctx.db.commercialOrder.findUniqueOrThrow({
        where: { id: order.id },
      })
    ).totalMinor,
  ).toBe(200)
}
