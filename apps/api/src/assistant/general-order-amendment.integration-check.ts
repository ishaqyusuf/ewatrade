import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  createCommercialOrder,
  createSimpleCatalogItem,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  editGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"
export async function verifyOrderAmendmentProposals(
  original: GeneralContext,
  failingDb: GeneralContext["db"],
  conversationId: string,
) {
  const ctx = {
    ...original,
    requestHeaders: new Headers(original.requestHeaders),
  }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("Owned QA Store required")
  const actorUserId = ctx.session.user.id
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId,
    actorUserId,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Assistant amendment QA",
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
  if (!unit) throw Error("Unit required")
  const source = await db.stockBalanceSource.create({
    data: {
      tenantId,
      storeId,
      productId: unit.configurationVersion.productId,
      variantId: offering.variantId,
      inventoryUnitId: unit.id,
      kind: "SHARED_POOL",
      onHandQuantity: "6",
    },
  })
  const create = async (quantity: string) => {
    const current = await db.stockBalanceSource.findUniqueOrThrow({
      where: { id: source.id },
    })
    return createCommercialOrder(db, {
      tenantId,
      storeId,
      actorUserId,
      clientOrderId: randomUUID(),
      schemaVersion: 1,
      lines: [
        {
          offeringId: offering.id,
          quantity,
          expectedFixedPriceMinor: 100,
          expectedConfigurationVersionId: unit.configurationVersionId,
          expectedBalanceRevision: current.revision,
        },
      ],
    })
  }

  const order = await create("2")
  const scope = { tenantId, storeId, orderId: order.id }

  async function draft(payload: GeneralAction) {
    const result = await draftGeneralProposal(ctx, conversationId, payload)
    const row = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: result.proposalId },
    })
    expect(
      (await generalProposalWithReview(ctx, row)).review?.length,
    ).toBeGreaterThan(0)
    const app = generalProposalForApp(row)
    return {
      proposalId: app.id,
      revision: app.revision,
      approvalToken: app.approvalToken,
      decision: "confirm" as const,
    }
  }
  if (process.env.RUN_GENERAL_ORDER_AMENDMENT_REPLACEMENT_ONLY !== "1") {
    console.info("Assistant amendments: metadata edit, rollback and replay")
    const metadata = {
      action: "order_metadata_update" as const,
      orderId: order.id,
      patch: { notes: "First notes" },
      reason: "Customer request",
    }
    const beforeEdit = await draft(metadata)
    const edited = await editGeneralProposal(ctx, {
      proposalId: beforeEdit.proposalId,
      revision: beforeEdit.revision,
      payload: { ...metadata, patch: { notes: "Reviewed notes" } },
    })
    await expect(decideGeneralProposal(ctx, beforeEdit)).rejects.toThrow()
    const editedRow = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: beforeEdit.proposalId },
    })
    const app = generalProposalForApp(editedRow)
    const command = {
      proposalId: app.id,
      revision: app.revision,
      approvalToken: app.approvalToken,
      decision: "confirm" as const,
    }
    expect(edited).toBeDefined()
    await expect(
      decideGeneralProposal({ ...ctx, db: failingDb }, command),
    ).rejects.toThrow("Injected receipt failure")
    expect(
      (await db.commercialOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .notes,
    ).toBeNull()
    expect(
      await db.commercialOrderAmendment.count({ where: { tenantId } }),
    ).toBe(0)
    const saved = await decideGeneralProposal(ctx, command)
    expect(saved.receipt?.recordId).toBe(order.id)
    expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(
      saved.receipt,
    )
    expect(
      (await db.commercialOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .notes,
    ).toBe("Reviewed notes")
  }
  console.info("Assistant amendments: replacement receipt composition")
  const line = await db.commercialOrderLine.findFirstOrThrow({
    where: { orderId: order.id },
  })
  const replacement = await draft({
    action: "order_replace",
    orderId: order.id,
    changes: [{ orderLineId: line.id, quantity: "3", unitPriceMinor: 125 }],
    reason: "Agreed quantity and price",
  })
  await expect(
    decideGeneralProposal({ ...ctx, db: failingDb }, replacement),
  ).rejects.toThrow("Injected receipt failure")
  expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(1)
  const replaced = await decideGeneralProposal(ctx, replacement)
  const replacementId = replaced.receipt?.recordId
  if (!replacementId) throw Error("Replacement receipt required")
  expect(replacementId).not.toBe(order.id)
  expect((await decideGeneralProposal(ctx, replacement)).receipt).toEqual(
    replaced.receipt,
  )
  expect(
    (
      await db.commercialOrder.findUniqueOrThrow({
        where: { id: replacementId },
      })
    ).totalMinor,
  ).toBe(375)
  console.info(
    "Assistant amendments: cancellation with current-role revocation",
  )
  await expect(
    draft({
      action: "order_cancel",
      orderId: "foreign",
      reason: "Wrong scope",
    }),
  ).rejects.toThrow()
  const cancellation = await draft({
    action: "order_cancel",
    orderId: replacementId,
    reason: "Customer cancelled",
  })
  await db.membership.update({
    where: { id: ctx.tenantContext.membership.id },
    data: { role: "CASHIER" },
  })
  await expect(decideGeneralProposal(ctx, cancellation)).rejects.toThrow()
  expect(
    (
      await db.commercialOrder.findUniqueOrThrow({
        where: { id: replacementId },
      })
    ).status,
  ).toBe("CONFIRMED")
  await db.membership.update({
    where: { id: ctx.tenantContext.membership.id },
    data: { role: ctx.tenantContext.membership.role },
  })
  const cancelled = await decideGeneralProposal(ctx, cancellation)
  expect(cancelled.receipt?.recordId).toBe(replacementId)
  expect((await decideGeneralProposal(ctx, cancellation)).receipt).toEqual(
    cancelled.receipt,
  )
  const balance = await db.stockBalanceSource.findUniqueOrThrow({
    where: { id: source.id },
  })
  expect(balance.reservedQuantity.toFixed()).toBe("0")
  expect(balance.onHandQuantity.toFixed()).toBe("6")
  expect(await db.commercialOrderAmendment.count({ where: { tenantId } })).toBe(
    3,
  )
  expect(
    await db.stockMovement.count({ where: { operation: { tenantId } } }),
  ).toBe(0)
}
