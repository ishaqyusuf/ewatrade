import { withPerformanceTrace } from "@ewatrade/db/performance-tracing"
import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { createCommercialOrder, createSimpleCatalogItem } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal, draftGeneralProposal, generalProposalForApp, generalProposalWithReview } from "./general-proposals"

export async function verifyBulkFulfillmentComposition(original: GeneralContext, failingDb: GeneralContext["db"], conversationId: string) {
  const ctx = { ...original, requestHeaders: new Headers(original.requestHeaders) }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA") throw Error("Owned QA Store required")
  const actorUserId = ctx.session.user.id
  console.info("Bulk acceptance: create shared-balance products and catalog-free service")
  const trace = <T>(stage: string, work: () => Promise<T>) => withPerformanceTrace(
    "job", work, measurement => console.info(JSON.stringify({stage, ...measurement})),
  )
  const product = await trace("bulk-fixture-product", () => createSimpleCatalogItem(db, {
    tenantId, storeId, actorUserId, clientOperationId: randomUUID(),
    kind: "product", name: "Fulfilment product QA", canonicalUnitName: "Piece", priceMinor: 100,
  }))
  const productOffering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: product.id }, include: { productUnitOffering: { include: { inventoryUnit: { include: { configurationVersion: true } } } } },
  })
  const unit = productOffering.productUnitOffering?.inventoryUnit
  if (!unit) throw Error("Product unit required")
  const source = await db.stockBalanceSource.create({ data: {
    tenantId, storeId, productId: unit.configurationVersion.productId, variantId: productOffering.variantId,
    inventoryUnitId: unit.id, kind: "SHARED_POOL", onHandQuantity: "6",
  } })
  // Provision the reusable catalog-free Offering in its own canonical setup
  // command. The acceptance target is bulk fulfillment, not first-use provisioning.
  console.info("Bulk acceptance: provision catalog-free offering")
  await trace("bulk-fixture-catalog-free", () => createCommercialOrder(db, {
    tenantId, storeId, actorUserId, clientOrderId: randomUUID(), schemaVersion: 1,
    fulfillNow: false, lines: [{ custom: "additional_cost", amountMinor: 1 }],
  }))
  console.info("Bulk acceptance: create three-line target order")
  const order = await trace("bulk-fixture-order", () => createCommercialOrder(db, {
    tenantId, storeId, actorUserId, clientOrderId: randomUUID(), schemaVersion: 1, fulfillNow: false,
    lines: [
      { offeringId: productOffering.id, quantity: "1", expectedFixedPriceMinor: 100, expectedConfigurationVersionId: unit.configurationVersionId, expectedBalanceRevision: source.revision },
      { offeringId: productOffering.id, quantity: "2", expectedFixedPriceMinor: 100, expectedConfigurationVersionId: unit.configurationVersionId, expectedBalanceRevision: source.revision },
      { custom: "additional_cost", amountMinor: 50, description: "Packing" },
    ],
  }))
  const balance = () => db.stockBalanceSource.findUniqueOrThrow({ where: { id: source.id } })
  const lineIds = (await db.commercialOrderLine.findMany({where:{orderId:order.id},select:{id:true}})).map(row=>row.id)
  const payload = { action: "product_batch_fulfill" as const, orderId: order.id, reason: "All items collected" }
  async function draft() {
    const result = await draftGeneralProposal(ctx, conversationId, payload)
    const row = await db.assistantActionProposal.findUniqueOrThrow({where:{id:result.proposalId}})
    const review = await generalProposalWithReview(ctx,row)
    expect(review.review?.join(" ")).toContain("6 → 3")
    expect(review.review?.join(" ")).toContain("Record service performance")
    const app = generalProposalForApp(row)
    return {proposalId:app.id,revision:app.revision,approvalToken:app.approvalToken,decision:"confirm" as const}
  }
  console.info("Bulk acceptance: stale stock review refusal")
  const stale=await draft()
  await db.stockBalanceSource.update({where:{id:source.id},data:{revision:{increment:1}}})
  await expect(decideGeneralProposal(ctx,stale)).rejects.toMatchObject({code:"CONFLICT"})
  console.info("Bulk acceptance: receipt failure rolls back service, stock and command")
  const command=await draft()
  await expect(decideGeneralProposal({...ctx,db:failingDb},command)).rejects.toThrow("Injected receipt failure")
  expect((await balance()).onHandQuantity.toFixed()).toBe("6")
  expect((await balance()).reservedQuantity.toFixed()).toBe("3")
  expect(await db.productFulfillment.count({where:{orderLineId:{in:lineIds}}})).toBe(0)
  expect(await db.commercialServiceFulfillment.count({where:{orderId:order.id}})).toBe(0)
  expect(await db.commercialOrderFulfillmentCommand.count({where:{orderId:order.id}})).toBe(0)
  console.info("Bulk acceptance: confirm and replay exactly once")
  const receipt=await decideGeneralProposal(ctx,command)
  expect(receipt.receipt).toMatchObject({kind:"order",recordId:order.id})
  expect((await decideGeneralProposal(ctx,command)).receipt).toEqual(receipt.receipt)
  expect((await balance()).onHandQuantity.toFixed()).toBe("3")
  expect((await balance()).reservedQuantity.toFixed()).toBe("0")
  expect(await db.productFulfillment.count({where:{orderLineId:{in:lineIds}}})).toBe(2)
  expect(await db.commercialServiceFulfillment.count({where:{orderId:order.id}})).toBe(1)
  expect(await db.commercialOrderFulfillmentCommand.count({where:{orderId:order.id}})).toBe(1)
  expect(await db.stockMovement.count({where:{balanceSourceId:source.id}})).toBe(2)
  const completed=await db.commercialOrder.findUniqueOrThrow({where:{id:order.id}})
  expect(completed.status).toBe("COMPLETED")
  expect(completed.completedAt).not.toBeNull()
  console.info("Bulk acceptance: shared balance, service performance, rollback and replay passed")
}
