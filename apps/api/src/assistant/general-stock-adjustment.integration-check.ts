import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { createSimpleCatalogItem } from "@ewatrade/db/queries"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

export async function verifyStockAdjustmentComposition(
  originalContext: GeneralContext,
  failingDb: GeneralContext["db"],
  conversationId: string,
) {
  const ctx = {
    ...originalContext,
    requestHeaders: new Headers(originalContext.requestHeaders),
  }
  ctx.requestHeaders.set("x-assistant-client", "dashboard")
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("Owned QA Store required")
  const item = await createSimpleCatalogItem(ctx.db, {
    tenantId,
    storeId,
    actorUserId: ctx.session.user.id,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Stock adjustment composition QA",
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
  if (!unit) throw Error("Product unit required")
  const source = await ctx.db.stockBalanceSource.create({
    data: {
      tenantId,
      storeId,
      productId: unit.configurationVersion.productId,
      variantId: offering.variantId,
      inventoryUnitId: unit.id,
      kind: "SHARED_POOL",
      onHandQuantity: "5",
      reservedQuantity: "2",
    },
  })

  const balance = async () =>
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed()
  const draft = async (payload: GeneralAction) => {
    const result = await draftGeneralProposal(ctx, conversationId, payload)
    const row = await ctx.db.assistantActionProposal.findUniqueOrThrow({
      where: { id: result.proposalId },
    })
    const app = generalProposalForApp(row)
    return {
      review: await generalProposalWithReview(ctx, row),
      command: {
        proposalId: app.id,
        revision: app.revision,
        decision: "confirm" as const,
        approvalToken: app.approvalToken,
      },
    }
  }
  const payload = {
    action: "stock_adjust" as const,
    balanceSourceId: source.id,
    enteredInventoryUnitId: unit.id,
    enteredQuantity: "2",
    direction: "decrease" as const,
    purpose: "waste" as const,
    reason: "Two broken pieces",
    categories: [{ name: "Damage" }],
  }
  await expect(draft({ ...payload, enteredQuantity: "4" })).rejects.toThrow(
    "reserved",
  )
  await expect(
    draft({ ...payload, balanceSourceId: "foreign" }),
  ).rejects.toThrow()
  const adjustment = await draft(payload)
  expect(adjustment.review.review?.some((line) => line.includes("5 → 3"))).toBe(
    true,
  )
  await expect(
    decideGeneralProposal({ ...ctx, db: failingDb }, adjustment.command),
  ).rejects.toThrow("Injected receipt failure")
  expect(await balance()).toBe("5")
  expect(await ctx.db.stockOperation.count({ where: { tenantId } })).toBe(0)
  const saved = await decideGeneralProposal(ctx, adjustment.command)
  expect(saved.receipt?.kind).toBe("inventory")
  expect(await balance()).toBe("3")
  expect(
    (await decideGeneralProposal(ctx, adjustment.command)).receipt,
  ).toEqual(saved.receipt)
  if (!saved.receipt) throw Error("Adjustment receipt required")
  const original = await ctx.db.stockOperation.findUniqueOrThrow({
    where: { id: saved.receipt.recordId },
    include: {
      movements: true,
      categories: { include: { categoryName: true } },
    },
  })
  expect(original.type).toBe("ADJUSTMENT")
  expect(original.movements).toHaveLength(1)
  expect(original.movements[0]?.signedCanonicalEffect.toFixed()).toBe("-2")
  const movement = original.movements[0]!
  const corrected = await draft({
    action: "stock_correct",
    targetOperationId: original.id,
    reason: "Only one piece was broken",
    corrections: [{ movementId: movement.id, correctedEnteredQuantity: "1" }],
  })
  expect(corrected.review.review?.some((line) => line.includes("3 → 4"))).toBe(
    true,
  )
  await expect(
    decideGeneralProposal({ ...ctx, db: failingDb }, corrected.command),
  ).rejects.toThrow("Injected receipt failure")
  expect(await balance()).toBe("3")
  expect(await ctx.db.stockOperation.count({ where: { tenantId } })).toBe(1)
  const result = await decideGeneralProposal(ctx, corrected.command)
  expect(result.receipt?.title).toBe("Stock operation corrected")
  expect(await balance()).toBe("4")
  expect((await decideGeneralProposal(ctx, corrected.command)).receipt).toEqual(
    result.receipt,
  )
  const operations = await ctx.db.stockOperation.findMany({
    where: { tenantId },
    include: { movements: true },
  })
  expect(operations).toHaveLength(2)
  const correction = operations.find(
    (operation) => operation.type === "CORRECTION",
  )
  expect(correction?.correctionOfOperationId).toBe(original.id)
  expect(correction?.movements).toHaveLength(2)
  expect(
    correction?.movements
      .map((entry) => entry.signedCanonicalEffect.toFixed())
      .sort(),
  ).toEqual(["-1", "2"])
  await expect(
    draft({
      action: "stock_correct",
      targetOperationId: original.id,
      reason: "Duplicate correction",
      corrections: [{ movementId: movement.id, correctedEnteredQuantity: "1" }],
    }),
  ).rejects.toThrow("already has a correction")
}
