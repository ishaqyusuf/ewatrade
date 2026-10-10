import { withPerformanceTrace } from "@ewatrade/db/performance-tracing"
import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { startGeneralConversation } from "@ewatrade/db/assistant-general"
import {
  createSimpleCatalogItem,
  getActiveTenantForUser,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

export async function verifyStockTransferComposition(
  original: GeneralContext,
  failingDb: GeneralContext["db"],
  conversationId: string,
) {
  const db = original.db
  const tenantId = original.tenantContext.tenant.id
  const sourceStoreId = original.tenantContext.activeStore?.id
  if (
    !sourceStoreId ||
    original.tenantContext.tenant.dataClassification !== "QA"
  )
    throw Error("Owned QA Store required")
  const target = await db.store.create({
    data: {
      tenantId,
      name: "Transfer destination QA",
      slug: `transfer-${randomUUID()}`,
      status: "ACTIVE",
    },
  })
  async function context(storeId: string): Promise<GeneralContext> {
    const tenantContext = await getActiveTenantForUser(db, {
      userId: original.session.user.id,
      tenantSlug: original.tenantContext.tenant.slug,
      storeId,
    })
    if (!tenantContext) throw Error("QA transfer context missing")
    const headers = new Headers(original.requestHeaders)
    headers.set("x-assistant-client", "dashboard")
    return {
      ...original,
      tenantContext,
      activeStoreId: storeId,
      requestHeaders: headers,
    }
  }
  const sourceCtx = await context(sourceStoreId)
  const targetCtx = await context(target.id)
  const targetConversation = await startGeneralConversation(db, {
    tenantId,
    storeId: target.id,
    userId: original.session.user.id,
  })
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId: sourceStoreId,
    actorUserId: original.session.user.id,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Transfer composition QA",
    canonicalUnitName: "Piece",
    priceMinor: 100,
  })
  const offering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
    include: {
      productUnitOffering: {
        include: { inventoryUnit: { include: { configurationVersion: true } } },
      },
    },
  })
  const unit = offering.productUnitOffering?.inventoryUnit
  if (!unit) throw Error("QA transfer unit missing")
  const source = await db.stockBalanceSource.create({
    data: {
      tenantId,
      storeId: sourceStoreId,
      productId: unit.configurationVersion.productId,
      variantId: offering.variantId,
      inventoryUnitId: unit.id,
      kind: "SHARED_POOL",
      onHandQuantity: "5",
    },
  })
  async function draft(
    ctx: GeneralContext,
    chat: string,
    action: GeneralAction,
  ) {
    const result = await draftGeneralProposal(ctx, chat, action)
    const row = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: result.proposalId },
    })
    const app = generalProposalForApp(row)
    const review = await generalProposalWithReview(ctx, row)
    expect(review.review?.length).toBeGreaterThan(0)
    return {
      proposalId: app.id,
      revision: app.revision,
      approvalToken: app.approvalToken,
      decision: "confirm" as const,
    }
  }
  console.info("Transfer proposal acceptance: dispatch")
  const dispatch = await draft(sourceCtx, conversationId, {
    action: "stock_transfer_dispatch",
    sourceBalanceSourceId: source.id,
    targetStoreId: target.id,
    quantity: "4",
    reason: "QA dispatch",
  })
  expect(await db.stockTransfer.count({ where: { tenantId } })).toBe(0)
  await expect(
    withPerformanceTrace(
      "job",
      () => decideGeneralProposal({ ...sourceCtx, db: failingDb }, dispatch),
      (trace) => console.info("Transfer dispatch rollback:", JSON.stringify(trace)),
    ),
  ).rejects.toThrow("Injected receipt failure")
  expect(await db.stockTransfer.count({ where: { tenantId } })).toBe(0)
  expect(
    (
      await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("5")
  const sent = await decideGeneralProposal(sourceCtx, dispatch)
  expect(sent.receipt?.kind).toBe("stock_transfer")
  const transferId = sent.receipt?.recordId
  if (!transferId) throw Error("Saved transfer missing")
  expect((await decideGeneralProposal(sourceCtx, dispatch)).receipt).toEqual(
    sent.receipt,
  )
  expect(await db.stockTransfer.count({ where: { tenantId } })).toBe(1)
  const read = () =>
    db.stockTransfer.findUniqueOrThrow({
      where: { id: transferId },
      include: { transitBalanceSource: true, acknowledgments: true },
    })
  expect((await read()).transitBalanceSource?.onHandQuantity.toFixed()).toBe(
    "4",
  )
  await expect(
    draftGeneralProposal(sourceCtx, conversationId, {
      action: "stock_transfer_receive",
      transferId,
      quantity: "1",
      reason: "Wrong active Store",
    }),
  ).rejects.toThrow()
  console.info("Transfer proposal acceptance: receipt and role loss")
  const receive = await draft(targetCtx, targetConversation.id, {
    action: "stock_transfer_receive",
    transferId,
    quantity: "1",
    reason: "Only one arrived; three remain outstanding",
  })
  const competingReceive = await draft(targetCtx, targetConversation.id, {
    action: "stock_transfer_receive",
    transferId,
    quantity: "1",
    reason: "Another review of the same incoming stock",
  })
  await db.membership.update({
    where: { id: original.tenantContext.membership.id },
    data: { role: "CASHIER" },
  })
  try {
    await expect(
      decideGeneralProposal(targetCtx, receive),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect((await read()).acknowledgments).toHaveLength(0)
  } finally {
    await db.membership.update({
      where: { id: original.tenantContext.membership.id },
      data: { role: "OWNER" },
    })
  }
  await expect(
    withPerformanceTrace(
      "job",
      () => decideGeneralProposal({ ...targetCtx, db: failingDb }, receive),
      (trace) =>
        console.info("Transfer receipt rollback:", JSON.stringify(trace)),
    ),
  ).rejects.toThrow("Injected receipt failure")
  expect((await read()).transitBalanceSource?.onHandQuantity.toFixed()).toBe(
    "4",
  )
  expect((await read()).acknowledgments).toHaveLength(0)
  const received = await withPerformanceTrace(
    "job",
    () => decideGeneralProposal(targetCtx, receive),
    (trace) =>
      console.info("Transfer receipt confirmation:", JSON.stringify(trace)),
  )
  expect((await decideGeneralProposal(targetCtx, receive)).receipt).toEqual(
    received.receipt,
  )
  await expect(
    decideGeneralProposal(targetCtx, competingReceive),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  const partial = await read()
  expect(partial.status).toBe("IN_TRANSIT")
  expect(partial.transitBalanceSource?.onHandQuantity.toFixed()).toBe("3")
  expect(partial.acknowledgments).toHaveLength(1)
  expect(partial.acknowledgments[0]?.quantity.toFixed()).toBe("1")
  expect(partial.acknowledgments[0]?.reason).toBe(
    "Only one arrived; three remain outstanding",
  )
  await expect(
    draftGeneralProposal(targetCtx, targetConversation.id, {
      action: "stock_transfer_receive",
      transferId,
      quantity: "4",
      reason: "Over receipt",
    }),
  ).rejects.toThrow()
  console.info("Transfer proposal acceptance: return outstanding stock")
  const cancel = await draft(sourceCtx, conversationId, {
    action: "stock_transfer_cancel",
    transferId,
    reason: "Return undelivered remainder",
  })
  await expect(
    withPerformanceTrace(
      "job",
      () => decideGeneralProposal({ ...sourceCtx, db: failingDb }, cancel),
      (trace) => console.info("Transfer cancellation rollback:", JSON.stringify(trace)),
    ),
  ).rejects.toThrow("Injected receipt failure")
  expect((await read()).status).toBe("IN_TRANSIT")
  expect((await read()).acknowledgments).toHaveLength(1)
  const cancelled = await withPerformanceTrace("job", () => decideGeneralProposal(sourceCtx, cancel), (trace) => console.info("Transfer cancellation confirmation:", JSON.stringify(trace)))
  expect((await decideGeneralProposal(sourceCtx, cancel)).receipt).toEqual(
    cancelled.receipt,
  )
  const final = await read()
  expect(final.status).toBe("CANCELLED")
  expect(final.transitBalanceSource?.onHandQuantity.toFixed()).toBe("0")
  expect(final.acknowledgments).toHaveLength(2)
  expect(
    (
      await db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("4")
  const destination = await db.stockBalanceSource.findFirstOrThrow({
    where: {
      tenantId,
      storeId: target.id,
      inventoryUnitId: unit.id,
      custodyType: "STORE",
    },
  })
  expect(destination.onHandQuantity.toFixed()).toBe("1")
  expect((await decideGeneralProposal(targetCtx, receive)).receipt).toEqual(
    received.receipt,
  )
  expect((await read()).acknowledgments).toHaveLength(2)
}
