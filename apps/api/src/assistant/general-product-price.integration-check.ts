import { expect } from "bun:test"
import { updateCatalogPriceInTransaction } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

/** Runs inside the existing isolated GENERAL fixture and its owned cleanup. */
export async function verifyGeneralPriceUpdate(
  ctx: GeneralContext,
  failingDb: GeneralContext["db"],
  conversationId: string,
  offeringId: string,
  orderId: string,
) {
  const web = {
    ...ctx,
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
  }
  const db = ctx.db
  const original = await db.sellableOffering.findUniqueOrThrow({
    where: { id: offeringId },
  })
  const before = await db.catalogPriceChange.count({ where: { offeringId } })
  const payload = {
    action: "product_price_update" as const,
    offeringId,
    priceMinor: 3000,
    reason: "QA price correction",
  }
  const draft = await draftGeneralProposal(web, conversationId, payload)
  const row = await db.assistantActionProposal.findUniqueOrThrow({
    where: { id: draft.proposalId },
  })
  const app = generalProposalForApp(row)
  expect((await generalProposalWithReview(web, row)).review).toContain(
    "Price: NGN 25.00 → NGN 30.00",
  )
  const command = {
    proposalId: app.id,
    revision: app.revision,
    decision: "confirm" as const,
    approvalToken: app.approvalToken,
  }
  await expect(
    decideGeneralProposal({ ...web, db: failingDb }, command),
  ).rejects.toThrow("Injected receipt failure")
  expect(
    (await db.sellableOffering.findUniqueOrThrow({ where: { id: offeringId } }))
      .fixedPriceMinor,
  ).toBe(original.fixedPriceMinor)
  expect(await db.catalogPriceChange.count({ where: { offeringId } })).toBe(
    before,
  )
  const result = await decideGeneralProposal(web, command)
  expect(result.receipt?.title).toBe("Product price updated")
  expect((await decideGeneralProposal(web, command)).receipt).toEqual(
    result.receipt,
  )
  expect(await db.catalogPriceChange.count({ where: { offeringId } })).toBe(
    before + 1,
  )
  const saved = await db.sellableOffering.findUniqueOrThrow({
    where: { id: offeringId },
  })
  expect(saved.fixedPriceMinor).toBe(3000)
  expect(saved.revision).toBe(original.revision + 1)
  const line = await db.commercialOrderLine.findFirstOrThrow({
    where: { orderId, offeringId },
    include: { snapshot: true },
  })
  expect(line.unitPriceMinor).toBe(2500)
  expect(line.snapshot?.unitPriceMinor).toBe(2500)
  const stale = await draftGeneralProposal(web, conversationId, {
    ...payload,
    priceMinor: 3500,
  })
  const staleApp = generalProposalForApp(
    await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: stale.proposalId },
    }),
  )
  await db.$transaction((tx) =>
    updateCatalogPriceInTransaction(tx, {
      tenantId: original.tenantId,
      actorUserId: ctx.session.user.id,
      offeringId,
      expectedRevision: saved.revision,
      priceMinor: 3200,
      reason: "A concurrent authorized price change",
    }),
  )
  await expect(
    decideGeneralProposal(web, {
      proposalId: staleApp.id,
      revision: staleApp.revision,
      decision: "confirm",
      approvalToken: staleApp.approvalToken,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(
    (await db.sellableOffering.findUniqueOrThrow({ where: { id: offeringId } }))
      .fixedPriceMinor,
  ).toBe(3200)
}
