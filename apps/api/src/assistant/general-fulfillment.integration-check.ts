import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { createCommercialOrder, createSimpleCatalogItem } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

export async function verifyFulfillmentComposition(original: GeneralContext, failingDb: GeneralContext["db"], conversationId: string) {
  const ctx = { ...original, requestHeaders: new Headers(original.requestHeaders) }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA") throw Error("Owned QA Store required")
  const actorUserId = ctx.session.user.id
  console.info("Fulfilment acceptance: create reserved product and manual-release service")
  const product = await createSimpleCatalogItem(db, {
    tenantId, storeId, actorUserId, clientOperationId: randomUUID(),
    kind: "product", name: "Fulfilment product QA", canonicalUnitName: "Piece", priceMinor: 100,
  })
  const service = await createSimpleCatalogItem(db, {
    tenantId, storeId, actorUserId, clientOperationId: randomUUID(),
    kind: "service", name: "Fulfilment service QA", priceMinor: 200,
    workPolicy: "charge_only", authorizationPolicy: "manual_release",
  })
  const productOffering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: product.id }, include: { productUnitOffering: { include: { inventoryUnit: { include: { configurationVersion: true } } } } },
  })
  const serviceOffering = await db.sellableOffering.findFirstOrThrow({ where: { catalogItemId: service.id } })
  const unit = productOffering.productUnitOffering?.inventoryUnit
  if (!unit) throw Error("Product unit required")
  const source = await db.stockBalanceSource.create({ data: {
    tenantId, storeId, productId: unit.configurationVersion.productId, variantId: productOffering.variantId,
    inventoryUnitId: unit.id, kind: "SHARED_POOL", onHandQuantity: "6",
  } })
  const order = await createCommercialOrder(db, {
    tenantId, storeId, actorUserId, clientOrderId: randomUUID(), schemaVersion: 1, fulfillNow: false,
    lines: [
      { offeringId: productOffering.id, quantity: "2", expectedFixedPriceMinor: 100, expectedConfigurationVersionId: unit.configurationVersionId, expectedBalanceRevision: source.revision },
      { offeringId: serviceOffering.id, quantity: "1", expectedFixedPriceMinor: 200 },
    ],
  })
  const lines = await db.commercialOrderLine.findMany({ where: { orderId: order.id } })
  const productLine = lines.find(line => line.kind === "PRODUCT_UNIT")
  const serviceLine = lines.find(line => line.kind === "SERVICE")
  if (!productLine || !serviceLine) throw Error("Mixed order lines required")
  const readOrder = () => db.commercialOrder.findUniqueOrThrow({ where: { id: order.id } })
  const balance = () => db.stockBalanceSource.findUniqueOrThrow({ where: { id: source.id } })
  async function draft(payload: GeneralAction) {
    const result = await draftGeneralProposal(ctx, conversationId, payload)
    const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: result.proposalId } })
    const review = await generalProposalWithReview(ctx, row)
    expect(review.review?.length).toBeGreaterThan(0)
    const app = generalProposalForApp(row)
    return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
  }
  expect((await balance()).onHandQuantity.toFixed()).toBe("6")
  expect((await balance()).reservedQuantity.toFixed()).toBe("2")
  await expect(draftGeneralProposal(ctx, conversationId, { action: "service_line_fulfill", orderLineId: serviceLine.id, reason: "Attempt before release" })).rejects.toThrow()
  const productPayload = { action: "product_line_fulfill" as const, orderLineId: productLine.id, reason: "Customer collected product" }
  const stale = await draft(productPayload)
  console.info("Fulfilment acceptance: stale stock cannot be approved")
  await db.stockBalanceSource.update({ where: { id: source.id }, data: { revision: { increment: 1 } } })
  await expect(decideGeneralProposal(ctx, stale)).rejects.toMatchObject({ code: "CONFLICT" })
  expect(await db.productFulfillment.count({ where: { orderLineId: productLine.id } })).toBe(0)
  const productConfirm = await draft(productPayload)
  console.info("Fulfilment acceptance: product receipt rollback and partial Order completion")
  await expect(decideGeneralProposal({ ...ctx, db: failingDb }, productConfirm)).rejects.toThrow("Injected receipt failure")
  expect((await balance()).onHandQuantity.toFixed()).toBe("6")
  expect((await balance()).reservedQuantity.toFixed()).toBe("2")
  expect(await db.productFulfillment.count({ where: { orderLineId: productLine.id } })).toBe(0)
  const productReceipt = await decideGeneralProposal(ctx, productConfirm)
  expect(productReceipt.receipt).toMatchObject({ kind: "order", recordId: order.id })
  expect((await decideGeneralProposal(ctx, productConfirm)).receipt).toEqual(productReceipt.receipt)
  expect((await balance()).onHandQuantity.toFixed()).toBe("4")
  expect((await balance()).reservedQuantity.toFixed()).toBe("0")
  expect((await readOrder()).status).toBe("FULFILLING")
  expect((await readOrder()).completedAt).toBeNull()
  expect(await db.productFulfillment.count({ where: { orderLineId: productLine.id } })).toBe(1)
  const movementCount = await db.stockMovement.count({ where: { operation: { tenantId } } })
  expect(movementCount).toBe(1)
  console.info("Fulfilment acceptance: manager release authority, rollback and replay")
  const authorize = await draft({ action: "service_line_authorize", orderLineId: serviceLine.id, reason: "Manager reviewed work" })
  try {
    await db.membership.update({ where: { id: ctx.tenantContext.membership.id }, data: { role: "CASHIER" } })
    await expect(decideGeneralProposal(ctx, authorize)).rejects.toMatchObject({ code: "FORBIDDEN" })
  } finally {
    await db.membership.update({ where: { id: ctx.tenantContext.membership.id }, data: { role: "OWNER" } })
  }
  await expect(decideGeneralProposal({ ...ctx, db: failingDb }, authorize)).rejects.toThrow("Injected receipt failure")
  expect(await db.commercialServiceAuthorization.count({ where: { orderLineId: serviceLine.id } })).toBe(0)
  const releaseReceipt = await decideGeneralProposal(ctx, authorize)
  expect((await decideGeneralProposal(ctx, authorize)).receipt).toEqual(releaseReceipt.receipt)
  expect(await db.commercialServiceAuthorization.count({ where: { orderLineId: serviceLine.id } })).toBe(1)
  expect(await db.commercialServiceFulfillment.count({ where: { orderLineId: serviceLine.id } })).toBe(0)
  expect((await readOrder()).status).toBe("FULFILLING")
  console.info("Fulfilment acceptance: service performance rollback and derived completion")
  const perform = await draft({ action: "service_line_fulfill", orderLineId: serviceLine.id, reason: "Work completed and checked" })
  await expect(decideGeneralProposal({ ...ctx, db: failingDb }, perform)).rejects.toThrow("Injected receipt failure")
  expect(await db.commercialServiceFulfillment.count({ where: { orderLineId: serviceLine.id } })).toBe(0)
  expect((await readOrder()).status).toBe("FULFILLING")
  const done = await decideGeneralProposal(ctx, perform)
  expect((await decideGeneralProposal(ctx, perform)).receipt).toEqual(done.receipt)
  expect((await readOrder()).status).toBe("COMPLETED")
  expect((await readOrder()).completedAt).not.toBeNull()
  expect(await db.commercialServiceFulfillment.count({ where: { orderLineId: serviceLine.id } })).toBe(1)
  expect(await db.stockMovement.count({ where: { operation: { tenantId } } })).toBe(movementCount)
  expect((await balance()).onHandQuantity.toFixed()).toBe("4")
  console.info("Fulfilment acceptance: mixed Order, atomic receipts and exact replay passed")
}
