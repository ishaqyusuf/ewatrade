import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  createSimpleCatalogItem,
  getInventoryCloseoutReview,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

export async function verifyCloseoutComposition(
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
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId,
    actorUserId: ctx.session.user.id,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Closeout composition QA",
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
      custodyType: "STAFF",
      custodyReferenceId: ctx.session.user.id,
      onHandQuantity: "5",
    },
  })
  const balance = () =>
    db.stockBalanceSource.findUniqueOrThrow({ where: { id: source.id } })
  async function draft(payload: GeneralAction) {
    const result = await draftGeneralProposal(ctx, conversationId, payload)
    const row = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: result.proposalId },
    })
    const app = generalProposalForApp(row)
    expect(
      (await generalProposalWithReview(ctx, row)).review?.length,
    ).toBeGreaterThan(0)
    return {
      proposalId: app.id,
      revision: app.revision,
      approvalToken: app.approvalToken,
      decision: "confirm" as const,
    }
  }
  const creation = {
    action: "inventory_closeout_create" as const,
    custodyType: "staff" as const,
    custodyReferenceId: ctx.session.user.id,
    declarations: [{ balanceSourceId: source.id, declaredQuantity: "0" }],
    reason: "Physically empty custody",
  }
  console.info("Closeout acceptance: creation rollback and replay")
  await expect(
    draftGeneralProposal(ctx, conversationId, {
      ...creation,
      declarations: [...creation.declarations, ...creation.declarations],
    }),
  ).rejects.toThrow()
  await expect(
    draftGeneralProposal(ctx, conversationId, {
      ...creation,
      custodyReferenceId: "foreign",
    }),
  ).rejects.toThrow()
  const create = await draft(creation)
  expect(await db.inventoryCloseout.count({ where: { tenantId } })).toBe(0)
  await expect(
    decideGeneralProposal({ ...ctx, db: failingDb }, create),
  ).rejects.toThrow("Injected receipt failure")
  expect(await db.inventoryCloseout.count({ where: { tenantId } })).toBe(0)
  expect((await balance()).onHandQuantity.toFixed()).toBe("5")
  const saved = await decideGeneralProposal(ctx, create)
  expect(saved.receipt?.kind).toBe("inventory_closeout")
  if (!saved.receipt) throw Error("Receipt required")
  const closeoutId = saved.receipt.recordId
  expect((await decideGeneralProposal(ctx, create)).receipt).toEqual(
    saved.receipt,
  )
  expect(await db.inventoryCloseout.count({ where: { tenantId } })).toBe(1)
  expect((await balance()).onHandQuantity.toFixed()).toBe("5")
  const read = () =>
    getInventoryCloseoutReview(db, { tenantId, storeId, closeoutId })
  expect((await read()).lines[0]).toMatchObject({
    expectedQuantity: "5",
    declaredQuantity: "0",
    varianceQuantity: "-5",
    currentQuantity: "5",
    stockCurrent: true,
  })
  await expect(
    getInventoryCloseoutReview(db, {
      tenantId,
      storeId: "foreign",
      closeoutId,
    }),
  ).rejects.toThrow("not found")
  await expect(
    getInventoryCloseoutReview(db, {
      tenantId: "foreign",
      storeId,
      closeoutId,
    }),
  ).rejects.toThrow("not found")
  const finalPayload = {
    action: "inventory_closeout_finalize" as const,
    closeoutId,
    reason: "Reviewed original declarations",
  }
  const final = await draft(finalPayload)
  const competing = await draft(finalPayload)
  console.info("Closeout acceptance: role loss and reconciliation conflicts")
  try {
    await db.membership.update({
      where: { id: ctx.tenantContext.membership.id },
      data: { role: "OPERATOR" },
    })
    await expect(decideGeneralProposal(ctx, final)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  } finally {
    await db.membership.update({
      where: { id: ctx.tenantContext.membership.id },
      data: { role: original.tenantContext.membership.role },
    })
  }
  await db.stockBalanceSource.update({
    where: { id: source.id },
    data: { reservedQuantity: "1" },
  })
  expect((await read()).canFinalize).toBe(false)
  await expect(decideGeneralProposal(ctx, final)).rejects.toMatchObject({
    code: "CONFLICT",
  })
  expect((await read()).status).toBe("DRAFT")
  await db.stockBalanceSource.update({
    where: { id: source.id },
    data: { reservedQuantity: "0" },
  })
  console.info("Closeout acceptance: finalization rollback and replay")
  const movements = await db.stockMovement.count({
    where: { operation: { tenantId } },
  })
  await expect(
    decideGeneralProposal({ ...ctx, db: failingDb }, final),
  ).rejects.toThrow("Injected receipt failure")
  expect((await balance()).onHandQuantity.toFixed()).toBe("5")
  expect((await read()).status).toBe("DRAFT")
  expect(
    await db.stockMovement.count({ where: { operation: { tenantId } } }),
  ).toBe(movements)
  const finished = await decideGeneralProposal(ctx, final)
  expect(finished.receipt?.title).toBe("Custody closeout finalized")
  expect((await decideGeneralProposal(ctx, final)).receipt).toEqual(
    finished.receipt,
  )
  expect((await balance()).onHandQuantity.toFixed()).toBe("0")
  expect((await read()).status).toBe("FINALIZED")
  expect((await read()).lines[0]).toMatchObject({
    expectedQuantity: "5",
    declaredQuantity: "0",
    varianceQuantity: "-5",
    currentQuantity: "0",
  })
  await expect(decideGeneralProposal(ctx, competing)).rejects.toMatchObject({
    code: "CONFLICT",
  })
  expect(
    await db.stockMovement.count({ where: { operation: { tenantId } } }),
  ).toBe(movements + 1)
  console.info("Closeout acceptance: saved observations are never rebased")
  const nextCreate = await draft({
    ...creation,
    declarations: [{ balanceSourceId: source.id, declaredQuantity: "2" }],
  })
  const next = await decideGeneralProposal(ctx, nextCreate)
  if (!next.receipt) throw Error("Second closeout required")
  const stale = await draft({
    ...finalPayload,
    closeoutId: next.receipt.recordId,
  })
  await db.stockBalanceSource.update({
    where: { id: source.id },
    data: { revision: { increment: 1 }, onHandQuantity: "1" },
  })
  await expect(decideGeneralProposal(ctx, stale)).rejects.toMatchObject({
    code: "CONFLICT",
  })
  const staleRead = await getInventoryCloseoutReview(db, {
    tenantId,
    storeId,
    closeoutId: next.receipt.recordId,
  })
  expect(staleRead.canFinalize).toBe(false)
  expect(staleRead.lines[0]).toMatchObject({
    expectedQuantity: "0",
    declaredQuantity: "2",
    varianceQuantity: "2",
    currentQuantity: "1",
    stockCurrent: false,
  })
  expect(staleRead.status).toBe("DRAFT")
}
