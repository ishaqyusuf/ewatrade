import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  createSimpleCatalogItem,
  postOrdinaryBalanceStockOperationInTransaction,
  previewOrdinaryStockReceipt,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

export async function verifyStockReceiptComposition(
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
    name: "Stock receipt composition QA",
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
  const input = {
    tenantId,
    storeId,
    actorUserId: ctx.session.user.id,
    balanceSourceId: source.id,
    clientOperationId: randomUUID(),
    direction: "increase" as const,
    enteredInventoryUnitId: unit.id,
    enteredQuantity: "3",
    expectedBalanceRevision: source.revision,
    expectedConfigurationVersionId: unit.configurationVersionId,
    reason: "QA receipt",
    schemaVersion: 1,
    source: "assistant",
    type: "receipt" as const,
  }
  const preview = await previewOrdinaryStockReceipt(ctx.db, input)
  expect(preview).toMatchObject({
    before: "5",
    after: "8",
    reserved: "2",
    availableAfter: "6",
    enteredUnitName: "Piece",
    canonicalQuantity: "3",
  })
  const dozen = await ctx.db.inventoryUnit.create({
    data: {
      configurationVersionId: unit.configurationVersionId,
      key: "qa-dozen",
      name: "Dozen",
      factor: "12",
      transactionScale: 1,
      stockBehavior: "ALTERNATE_TRANSACTION",
    },
  })
  expect(
    await previewOrdinaryStockReceipt(ctx.db, {
      ...input,
      enteredInventoryUnitId: dozen.id,
      enteredQuantity: "1.5",
    }),
  ).toMatchObject({
    factor: "12",
    canonicalQuantity: "18",
    after: "23",
    reserved: "2",
    availableAfter: "21",
    balanceUnitName: "Piece",
  })
  await ctx.db.stockBalanceSource.update({
    where: { id: source.id },
    data: { custodyType: "TRANSIT" },
  })
  try {
    await expect(previewOrdinaryStockReceipt(ctx.db, input)).rejects.toThrow(
      "Store custody",
    )
  } finally {
    await ctx.db.stockBalanceSource.update({
      where: { id: source.id },
      data: { custodyType: "STORE" },
    })
  }
  await ctx.db.unitConfigurationVersion.update({
    where: { id: unit.configurationVersionId },
    data: { status: "SUPERSEDED" },
  })
  try {
    await expect(previewOrdinaryStockReceipt(ctx.db, input)).rejects.toThrow(
      "Current configuration",
    )
  } finally {
    await ctx.db.unitConfigurationVersion.update({
      where: { id: unit.configurationVersionId },
      data: { status: "CURRENT" },
    })
  }
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).revision,
  ).toBe(source.revision)
  await expect(
    previewOrdinaryStockReceipt(ctx.db, { ...input, storeId: "foreign" }),
  ).rejects.toThrow("not found")
  await expect(
    previewOrdinaryStockReceipt(ctx.db, {
      ...input,
      enteredInventoryUnitId: "foreign",
    }),
  ).rejects.toThrow("does not belong")
  await expect(
    ctx.db.$transaction(
      async (tx) => {
        await postOrdinaryBalanceStockOperationInTransaction(tx, input)
        throw Error("Receipt persistence failure")
      },
      { timeout: 30000 },
    ),
  ).rejects.toThrow("Receipt persistence failure")
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("5")
  expect(await ctx.db.stockOperation.count({ where: { tenantId } })).toBe(0)
  const saved = await ctx.db.$transaction(
    (tx) => postOrdinaryBalanceStockOperationInTransaction(tx, input),
    { timeout: 30000 },
  )
  const replay = await ctx.db.$transaction(
    (tx) => postOrdinaryBalanceStockOperationInTransaction(tx, input),
    { timeout: 30000 },
  )
  expect(replay.id).toBe(saved.id)
  const balance = await ctx.db.stockBalanceSource.findUniqueOrThrow({
    where: { id: source.id },
  })
  expect(balance.onHandQuantity.toFixed()).toBe("8")
  expect(balance.reservedQuantity.toFixed()).toBe("2")
  expect(await ctx.db.stockOperation.count({ where: { tenantId } })).toBe(1)
  const movement = await ctx.db.stockMovement.findFirstOrThrow({
    where: { operationId: saved.id },
  })
  expect(movement.unitCostMinorSnapshot).toBeNull()
  await expect(
    ctx.db.$transaction(
      (tx) =>
        postOrdinaryBalanceStockOperationInTransaction(tx, {
          ...input,
          clientOperationId: randomUUID(),
        }),
      { timeout: 30000 },
    ),
  ).rejects.toThrow("changed")
  await expect(
    ctx.db.$transaction(
      (tx) =>
        postOrdinaryBalanceStockOperationInTransaction(tx, {
          ...input,
          enteredQuantity: "4",
        }),
      { timeout: 30000 },
    ),
  ).rejects.toThrow("different input")
  const draft = await draftGeneralProposal(ctx, conversationId, {
    action: "stock_receive",
    balanceSourceId: source.id,
    enteredInventoryUnitId: unit.id,
    enteredQuantity: "3",
    source: "QA delivery",
    reason: "Received after count",
    supplierName: "QA supplier",
  })
  const row = await ctx.db.assistantActionProposal.findUniqueOrThrow({
    where: { id: draft.proposalId },
  })
  const app = generalProposalForApp(row)
  const reviewed = await generalProposalWithReview(ctx, row)
  expect(reviewed.review).toContain("On hand: 8 → 11 Piece")
  expect(reviewed.review).toContain(
    "Unit cost unknown; no purchase payment recorded.",
  )
  const command = {
    proposalId: app.id,
    revision: app.revision,
    decision: "confirm" as const,
    approvalToken: app.approvalToken,
  }
  await expect(
    decideGeneralProposal({ ...ctx, db: failingDb }, command),
  ).rejects.toThrow("Injected receipt failure")
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("8")
  const result = await decideGeneralProposal(ctx, command)
  expect(result.receipt?.kind).toBe("inventory")
  expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(
    result.receipt,
  )
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("11")
  expect(await ctx.db.stockOperation.count({ where: { tenantId } })).toBe(2)
  if (!result.receipt) throw Error("Stock receipt required")
  expect(
    (
      await ctx.db.stockOperation.findUniqueOrThrow({
        where: { id: result.receipt.recordId },
      })
    ).reason,
  ).toBe("Received after count\nSupplier: QA supplier")
  const pending = await draftGeneralProposal(ctx, conversationId, {
    action: "stock_receive",
    balanceSourceId: source.id,
    enteredInventoryUnitId: unit.id,
    enteredQuantity: "1",
    source: "QA",
    reason: "Stale review",
  })
  const pendingApp = generalProposalForApp(
    await ctx.db.assistantActionProposal.findUniqueOrThrow({
      where: { id: pending.proposalId },
    }),
  )
  const pendingCommand = {
    proposalId: pendingApp.id,
    revision: pendingApp.revision,
    decision: "confirm" as const,
    approvalToken: pendingApp.approvalToken,
  }
  await ctx.db.membership.update({
    where: { id: ctx.tenantContext.membership.id },
    data: { role: "CASHIER" },
  })
  try {
    await expect(
      decideGeneralProposal(ctx, pendingCommand),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  } finally {
    await ctx.db.membership.update({
      where: { id: ctx.tenantContext.membership.id },
      data: { role: ctx.tenantContext.membership.role },
    })
  }
  const current = await ctx.db.stockBalanceSource.findUniqueOrThrow({
    where: { id: source.id },
  })
  await ctx.db.$transaction(
    (tx) =>
      postOrdinaryBalanceStockOperationInTransaction(tx, {
        ...input,
        clientOperationId: randomUUID(),
        expectedBalanceRevision: current.revision,
        enteredQuantity: "1",
      }),
    { timeout: 30000 },
  )
  await expect(
    decideGeneralProposal(ctx, pendingCommand),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("12")
}
