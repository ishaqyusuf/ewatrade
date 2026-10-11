import { withPerformanceTrace } from "@ewatrade/db/performance-tracing"
import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { createCommercialOrder, createSimpleCatalogItem, fulfillCommercialOrderProductLine } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

/** Test-process activation only; the production manifest remains planned. */
export async function verifyProductReturnComposition(original: GeneralContext, failingDb: GeneralContext["db"], conversationId: string) {
  const ctx = { ...original, requestHeaders: new Headers(original.requestHeaders) }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const trace = <T>(stage: string, work: () => Promise<T>) => withPerformanceTrace("job", work, measurement => console.info(JSON.stringify({ stage, ...measurement })))
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA" || process.env.RUN_GENERAL_PRODUCT_RETURN !== "1")
    throw Error("Explicit owned QA return test required")
  const capability = capabilityForAction("product_line_return")
  const rollout = capability.rollout
  Object.assign(capability, { rollout: "source" })
  try {
    const actorUserId = ctx.session.user.id
    console.info("Return acceptance: create fulfilled fractional-quantity source")
    const product = await createSimpleCatalogItem(db, {
      tenantId, storeId, actorUserId, clientOperationId: randomUUID(), kind: "product",
      name: "Product return QA", canonicalUnitName: "Piece", priceMinor: 100,
    })
    const offering = await db.sellableOffering.findFirstOrThrow({
      where: { catalogItemId: product.id }, include: { productUnitOffering: { include: { inventoryUnit: { include: { configurationVersion: true } } } } },
    })
    const unit = offering.productUnitOffering?.inventoryUnit
    if (!unit) throw Error("Product unit required")
    const source = await db.stockBalanceSource.create({ data: {
      tenantId, storeId, productId: unit.configurationVersion.productId, variantId: offering.variantId,
      inventoryUnitId: unit.id, kind: "SHARED_POOL", onHandQuantity: "6",
    } })
    const order = await createCommercialOrder(db, {
      tenantId, storeId, actorUserId, clientOrderId: randomUUID(), schemaVersion: 1, fulfillNow: false,
      lines: [{ offeringId: offering.id, quantity: "2", expectedFixedPriceMinor: 100, expectedConfigurationVersionId: unit.configurationVersionId, expectedBalanceRevision: source.revision }],
    })
    const line = await db.commercialOrderLine.findFirstOrThrow({ where: { orderId: order.id } })
    await fulfillCommercialOrderProductLine(db, { tenantId, storeId, actorUserId, orderLineId: line.id, clientOperationId: randomUUID(), schemaVersion: 1, reason: "Collected" })
    const payload = { action: "product_line_return" as const, orderLineId: line.id, quantity: "0.5", disposition: "restock" as const, reason: "Customer returned unused item" }
    const balance = () => db.stockBalanceSource.findUniqueOrThrow({ where: { id: source.id } })
    async function draft(value = payload) {
      const result = await trace("return-draft", () => draftGeneralProposal(ctx, conversationId, value))
      const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: result.proposalId } })
      const review = await generalProposalWithReview(ctx, row)
      expect(review.review?.join(" ")).toContain("No customer credit or cash refund")
      expect(review.review?.join(" ")).toContain("No Finance Book")
      const app = generalProposalForApp(row)
      return { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" as const }
    }
    console.info("Return acceptance: missing target and over-return refuse drafts")
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, orderLineId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, quantity: "2.000001" })).rejects.toMatchObject({ code: "INVALID_ORDER" })
    console.info("Return acceptance: stale stock revision refuses confirmation")
    const stale = await draft()
    await db.stockBalanceSource.update({ where: { id: source.id }, data: { revision: { increment: 1 } } })
    await expect(decideGeneralProposal(ctx, stale)).rejects.toMatchObject({ code: "CONFLICT" })
    const command = await draft()
    console.info("Return acceptance: receipt failure rolls back return and stock")
    await expect(decideGeneralProposal({ ...ctx, db: failingDb }, command)).rejects.toThrow("Injected receipt failure")
    expect((await balance()).onHandQuantity.toFixed()).toBe("4")
    expect(await db.productReturn.count({ where: { orderLineId: line.id } })).toBe(0)
    expect(await db.stockMovement.count({ where: { balanceSourceId: source.id } })).toBe(1)
    expect((await db.assistantActionProposal.findUniqueOrThrow({ where: { id: command.proposalId } })).status).toBe("PENDING")
    console.info("Return acceptance: confirm and replay exactly once")
    const completed = await decideGeneralProposal(ctx, command)
    expect(completed.receipt).toMatchObject({ kind: "order", recordId: order.id })
    expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(completed.receipt)
    expect((await balance()).onHandQuantity.toFixed()).toBe("4.5")
    expect((await balance()).reservedQuantity.toFixed()).toBe("0")
    expect(await db.productReturn.count({ where: { orderLineId: line.id } })).toBe(1)
    expect(await db.stockMovement.count({ where: { balanceSourceId: source.id } })).toBe(2)
    console.info("Return acceptance: non-restock dispositions preserve available stock")
    for (const disposition of ["damaged", "quarantine", "no_restock"] as const) {
      const result = await draftGeneralProposal(ctx, conversationId, { ...payload, disposition, quantity: "0.5" })
      const row = await db.assistantActionProposal.findUniqueOrThrow({ where: { id: result.proposalId } })
      const app = generalProposalForApp(row)
      await decideGeneralProposal(ctx, { proposalId: app.id, revision: app.revision, approvalToken: app.approvalToken, decision: "confirm" })
      expect((await balance()).onHandQuantity.toFixed()).toBe("4.5")
    }
    expect(await db.productReturn.count({ where: { orderLineId: line.id } })).toBe(4)
    expect(await db.stockMovement.count({ where: { balanceSourceId: source.id } })).toBe(2)
    await expect(draftGeneralProposal(ctx, conversationId, { ...payload, quantity: "0.000001" })).rejects.toMatchObject({ code: "INVALID_ORDER" })
    expect((await db.commercialOrder.findUniqueOrThrow({ where: { id: order.id } })).amountPaidMinor).toBe(0)
    console.info("Return acceptance: no-Book stock, rollback, replay and all dispositions passed")
  } finally {
    Object.assign(capability, { rollout })
  }
}
