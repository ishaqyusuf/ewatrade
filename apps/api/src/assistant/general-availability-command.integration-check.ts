import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { startGeneralConversation } from "@ewatrade/db/assistant-general"
import {
  createSimpleCatalogItem,
  setCatalogOfferingStoreAvailability,
  setCatalogOfferingStoreAvailabilityInTransaction,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalWithReview,
} from "./general-proposals"

export async function verifyAvailabilityCommand(ctx: GeneralContext) {
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId || ctx.tenantContext.tenant.dataClassification !== "QA")
    throw Error("QA fixture required")
  const actorUserId = ctx.session.user.id
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId,
    actorUserId,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Availability QA",
    canonicalUnitName: "Piece",
    priceMinor: 25000,
  })
  const offering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
  })
  const where = { storeId_offeringId: { storeId, offeringId: offering.id } }
  const before = await db.storeOfferingAvailability.findUniqueOrThrow({ where })
  expect(before.isAvailable).toBe(true)
  const command = {
    tenantId,
    storeId,
    actorUserId,
    offeringId: offering.id,
    isAvailable: false,
    expectedAvailability: before,
  }
  await expect(
    db.$transaction(
      async (tx) => {
        await setCatalogOfferingStoreAvailabilityInTransaction(tx, command)
        throw Error("Simulated receipt failure")
      },
      { maxWait: 10000, timeout: 30000 },
    ),
  ).rejects.toThrow("Simulated receipt failure")
  expect(
    (await db.storeOfferingAvailability.findUniqueOrThrow({ where }))
      .isAvailable,
  ).toBe(true)
  await setCatalogOfferingStoreAvailability(db, command)
  const disabled = await db.storeOfferingAvailability.findUniqueOrThrow({
    where,
  })
  expect(disabled.isAvailable).toBe(false)
  await expect(
    setCatalogOfferingStoreAvailability(db, { ...command, isAvailable: true }),
  ).rejects.toThrow("changed")
  await setCatalogOfferingStoreAvailability(db, {
    ...command,
    isAvailable: true,
    expectedAvailability: disabled,
  })
  expect(
    (await db.storeOfferingAvailability.findUniqueOrThrow({ where }))
      .isAvailable,
  ).toBe(true)
  expect(
    (
      await db.sellableOffering.findUniqueOrThrow({
        where: { id: offering.id },
      })
    ).fixedPriceMinor,
  ).toBe(25000)
  const sibling = await db.store.create({
    data: {
      tenantId,
      name: "Other QA Store",
      slug: "other-qa",
      status: "ACTIVE",
    },
  })
  await setCatalogOfferingStoreAvailability(db, {
    ...command,
    storeId: sibling.id,
    expectedAvailability: null,
  })
  expect(
    (await db.storeOfferingAvailability.findUniqueOrThrow({ where }))
      .isAvailable,
  ).toBe(true)
  expect(
    (
      await db.storeOfferingAvailability.findUniqueOrThrow({
        where: {
          storeId_offeringId: { storeId: sibling.id, offeringId: offering.id },
        },
      })
    ).isAvailable,
  ).toBe(false)
}

export async function verifyAvailabilityProposal(ctx: GeneralContext) {
  const db = ctx.db
  const scope = {
    tenantId: ctx.tenantContext.tenant.id,
    storeId: ctx.tenantContext.activeStore?.id ?? "",
    userId: ctx.session.user.id,
  }
  const web = {
    ...ctx,
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
  }
  const item = await createSimpleCatalogItem(db, {
    ...scope,
    actorUserId: scope.userId,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Availability proposal QA",
    canonicalUnitName: "Piece",
    priceMinor: 17000,
  })
  const offering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
  })
  const conversation = await startGeneralConversation(db, scope)
  const payload = {
    action: "product_availability_update" as const,
    offeringId: offering.id,
    isAvailable: false,
  }
  const draft = await draftGeneralProposal(web, conversation.id, payload)
  const row = await db.assistantActionProposal.findUniqueOrThrow({
    where: { id: draft.proposalId },
  })
  const review = await generalProposalWithReview(web, row)
  expect(review.review?.join("\n")).toContain("Available → Unavailable")
  expect(review.review?.join("\n")).toContain("Only QA Store")
  if (!review.approvalToken) throw Error("Review unavailable")
  const decision = {
    proposalId: row.id,
    revision: row.revision,
    decision: "confirm" as const,
    approvalToken: review.approvalToken,
  }
  const completed = await decideGeneralProposal(web, decision)
  expect(completed.receipt?.title).toBe("Selling availability updated")
  expect((await decideGeneralProposal(web, decision)).receipt).toEqual(
    completed.receipt,
  )
  const availability = await db.storeOfferingAvailability.findUniqueOrThrow({
    where: {
      storeId_offeringId: { storeId: scope.storeId, offeringId: offering.id },
    },
  })
  expect(availability.isAvailable).toBe(false)
  await expect(
    draftGeneralProposal(web, conversation.id, payload),
  ).rejects.toThrow("already saved")
  const enableDraft = await draftGeneralProposal(web, conversation.id, {
    ...payload,
    isAvailable: true,
  })
  const enableRow = await db.assistantActionProposal.findUniqueOrThrow({
    where: { id: enableDraft.proposalId },
  })
  const enableReview = await generalProposalWithReview(web, enableRow)
  if (!enableReview.approvalToken) throw Error("Enable review unavailable")
  await setCatalogOfferingStoreAvailability(db, {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.userId,
    offeringId: offering.id,
    isAvailable: true,
    expectedAvailability: availability,
  })
  await expect(
    decideGeneralProposal(web, {
      proposalId: enableRow.id,
      revision: enableRow.revision,
      decision: "confirm",
      approvalToken: enableReview.approvalToken,
    }),
  ).rejects.toThrow()
  expect(
    (
      await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: enableRow.id },
      })
    ).status,
  ).toBe("PENDING")
}
