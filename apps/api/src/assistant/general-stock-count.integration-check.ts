import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  createSimpleCatalogItem,
  createStockCountInTransaction,
  finalizeStockCountInTransaction,
  getStockCountReview,
  previewStockCountCreation,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

export async function verifyStockCountComposition(
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
    name: "Count composition QA",
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
  if (!unit) throw Error("Unit required")
  const source = await ctx.db.stockBalanceSource.create({
    data: {
      tenantId,
      storeId,
      productId: unit.configurationVersion.productId,
      variantId: offering.variantId,
      inventoryUnitId: unit.id,
      kind: "SHARED_POOL",
      onHandQuantity: "5",
    },
  })
  const input = {
    tenantId,
    storeId,
    actorUserId: ctx.session.user.id,
    clientOperationId: randomUUID(),
    schemaVersion: 1,
    reason: "Physical count",
    lines: [
      {
        balanceSourceId: source.id,
        expectedRevision: source.revision,
        entries: [{ enteredInventoryUnitId: unit.id, enteredQuantity: "0" }],
      },
    ],
  }
  const options = { timeout: 30000 }
  const preview = await previewStockCountCreation(ctx.db, input)
  expect(preview[0]).toMatchObject({
    expectedQuantity: "5",
    observedQuantity: "0",
    varianceQuantity: "-5",
    expectedRevision: 0,
  })
  expect(await ctx.db.stockCount.count({ where: { tenantId } })).toBe(0)
  await expect(
    previewStockCountCreation(ctx.db, {
      ...input,
      lines: [...input.lines, ...input.lines],
    }),
  ).rejects.toThrow("once")
  await expect(
    ctx.db.$transaction(async (tx) => {
      await createStockCountInTransaction(tx, input)
      throw Error("Count receipt failure")
    }, options),
  ).rejects.toThrow("Count receipt failure")
  expect(await ctx.db.stockCount.count({ where: { tenantId } })).toBe(0)
  const first = await ctx.db.$transaction(
    (tx) => createStockCountInTransaction(tx, input),
    options,
  )
  expect(
    (
      await ctx.db.$transaction(
        (tx) => createStockCountInTransaction(tx, input),
        options,
      )
    ).id,
  ).toBe(first.id)
  const line = await ctx.db.stockCountLine.findFirstOrThrow({
    where: { stockCountId: first.id },
  })
  expect(line.observedQuantity.toFixed()).toBe("0")
  expect(line.varianceQuantity.toFixed()).toBe("-5")
  const review = await getStockCountReview(ctx.db, {
    tenantId,
    storeId,
    stockCountId: first.id,
  })
  expect(review.canFinalize).toBe(true)
  expect(review.lines[0]).toMatchObject({
    expectedQuantity: "5",
    observedQuantity: "0",
    varianceQuantity: "-5",
    currentQuantity: "5",
    stockCurrent: true,
  })
  await expect(
    getStockCountReview(ctx.db, {
      tenantId,
      storeId: "foreign",
      stockCountId: first.id,
    }),
  ).rejects.toThrow("not found")
  await expect(
    getStockCountReview(ctx.db, {
      tenantId: "foreign",
      storeId,
      stockCountId: first.id,
    }),
  ).rejects.toThrow("not found")
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("5")
  const second = await ctx.db.$transaction(
    (tx) =>
      createStockCountInTransaction(tx, {
        ...input,
        clientOperationId: randomUUID(),
        lines: [
          {
            balanceSourceId: source.id,
            expectedRevision: source.revision,
            entries: [
              { enteredInventoryUnitId: unit.id, enteredQuantity: "3" },
            ],
          },
        ],
      }),
    options,
  )
  const finalize = {
    tenantId,
    actorUserId: ctx.session.user.id,
    clientOperationId: randomUUID(),
    stockCountId: first.id,
    reason: "Reviewed empty shelf",
    schemaVersion: 1,
  }
  await expect(
    ctx.db.$transaction(async (tx) => {
      await finalizeStockCountInTransaction(tx, finalize)
      throw Error("Final receipt failure")
    }, options),
  ).rejects.toThrow("Final receipt failure")
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("5")
  expect(
    (await ctx.db.stockCount.findUniqueOrThrow({ where: { id: first.id } }))
      .status,
  ).toBe("DRAFT")
  const operation = await ctx.db.$transaction(
    (tx) => finalizeStockCountInTransaction(tx, finalize),
    options,
  )
  expect(
    (
      await ctx.db.$transaction(
        (tx) => finalizeStockCountInTransaction(tx, finalize),
        options,
      )
    ).id,
  ).toBe(operation.id)
  const retained = await getStockCountReview(ctx.db, {
    tenantId,
    storeId,
    stockCountId: second.id,
  })
  expect(retained.canFinalize).toBe(false)
  expect(retained.lines[0]).toMatchObject({
    expectedQuantity: "5",
    observedQuantity: "3",
    varianceQuantity: "-2",
    currentQuantity: "0",
    stockCurrent: false,
  })
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("0")
  await expect(
    ctx.db.$transaction(
      (tx) =>
        finalizeStockCountInTransaction(tx, {
          ...finalize,
          clientOperationId: randomUUID(),
          stockCountId: second.id,
        }),
      options,
    ),
  ).rejects.toThrow("changed before finalization")
  expect(
    (await ctx.db.stockCount.findUniqueOrThrow({ where: { id: second.id } }))
      .status,
  ).toBe("DRAFT")
  const proposal = await draftGeneralProposal(ctx, conversationId, {
    action: "stock_count_create",
    reason: "Assistant observed count",
    lines: [
      {
        balanceSourceId: source.id,
        entries: [{ enteredInventoryUnitId: unit.id, enteredQuantity: "2" }],
      },
    ],
  })
  const row = await ctx.db.assistantActionProposal.findUniqueOrThrow({
    where: { id: proposal.proposalId },
  })
  const app = generalProposalForApp(row)
  expect((await generalProposalWithReview(ctx, row)).review).toContain(
    "Save observations only. Stock does not change until a separate finalization is reviewed and confirmed.",
  )
  const command = {
    proposalId: app.id,
    revision: app.revision,
    approvalToken: app.approvalToken,
    decision: "confirm" as const,
  }
  const countBefore = await ctx.db.stockCount.count({ where: { tenantId } })
  await expect(
    decideGeneralProposal({ ...ctx, db: failingDb }, command),
  ).rejects.toThrow("Injected receipt failure")
  expect(await ctx.db.stockCount.count({ where: { tenantId } })).toBe(
    countBefore,
  )
  const created = await decideGeneralProposal(ctx, command)
  if (!created.receipt) throw Error("Count receipt required")
  expect(created.receipt.kind).toBe("stock_count")
  expect((await decideGeneralProposal(ctx, command)).receipt).toEqual(
    created.receipt,
  )
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("0")
  const finalProposal = await draftGeneralProposal(ctx, conversationId, {
    action: "stock_count_finalize",
    stockCountId: created.receipt.recordId,
    reason: "Reviewed adjustment",
  })
  const finalRow = await ctx.db.assistantActionProposal.findUniqueOrThrow({
    where: { id: finalProposal.proposalId },
  })
  const finalApp = generalProposalForApp(finalRow)
  const finalCommand = {
    proposalId: finalApp.id,
    revision: finalApp.revision,
    approvalToken: finalApp.approvalToken,
    decision: "confirm" as const,
  }
  await expect(
    decideGeneralProposal({ ...ctx, db: failingDb }, finalCommand),
  ).rejects.toThrow("Injected receipt failure")
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("0")
  const finalized = await decideGeneralProposal(ctx, finalCommand)
  expect(finalized.receipt?.title).toBe("Stock count finalized")
  expect((await decideGeneralProposal(ctx, finalCommand)).receipt).toEqual(
    finalized.receipt,
  )
  expect(
    (
      await ctx.db.stockBalanceSource.findUniqueOrThrow({
        where: { id: source.id },
      })
    ).onHandQuantity.toFixed(),
  ).toBe("2")
}
