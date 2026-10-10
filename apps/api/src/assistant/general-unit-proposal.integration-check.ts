import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { startGeneralConversation } from "@ewatrade/db/assistant-general"
import {
  createSimpleCatalogItem,
  updateProductUnitConfigurationDraft,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalWithReview,
} from "./general-proposals"

export async function verifyUnitProposals(ctx: GeneralContext) {
  const scope = {
    tenantId: ctx.tenantContext.tenant.id,
    storeId: ctx.tenantContext.activeStore?.id ?? "",
    userId: ctx.session.user.id,
  }
  const web = {
    ...ctx,
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
  }
  const item = await createSimpleCatalogItem(ctx.db, {
    ...scope,
    actorUserId: scope.userId,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Unit proposal QA",
    canonicalUnitName: "Piece",
    priceMinor: 19000,
  })
  const product = await ctx.db.catalogProduct.findUniqueOrThrow({
    where: { catalogItemId: item.id },
    include: { currentUnitConfiguration: { include: { units: true } } },
  })
  const main = product.currentUnitConfiguration?.units[0]
  if (!main) throw Error("Fixture main unit unavailable")
  const conversation = await startGeneralConversation(ctx.db, scope)
  const payload: Extract<
    GeneralAction,
    { action: "product_unit_configuration_draft" }
  > = {
    action: "product_unit_configuration_draft",
    catalogItemId: item.id,
    canonicalBalanceScale: 0,
    units: [
      {
        key: main.key,
        name: "Piece",
        factor: "1",
        stockBehavior: "canonical_shared",
        transactionScale: 0,
      },
      {
        key: "crate",
        name: "Crate",
        factor: "12",
        stockBehavior: "alternate_transaction",
        transactionScale: 0,
      },
    ],
  }
  async function review(action: GeneralAction) {
    const created = await draftGeneralProposal(web, conversation.id, action)
    const row = await ctx.db.assistantActionProposal.findUniqueOrThrow({
      where: { id: created.proposalId },
    })
    const card = await generalProposalWithReview(web, row)
    if (!card.approvalToken) throw Error("Review token unavailable")
    return {
      card,
      decision: {
        proposalId: row.id,
        revision: row.revision,
        decision: "confirm" as const,
        approvalToken: card.approvalToken,
      },
    }
  }
  const prepared = await review(payload)
  expect(prepared.card.review?.join("\n")).toContain("Save a Draft only")
  expect(prepared.card.review?.join("\n")).toContain("NGN 190.00")
  expect(prepared.card.review?.join("\n")).toContain("0 stock balance sources")
  const saved = await decideGeneralProposal(web, prepared.decision)
  expect(saved.receipt?.title).toBe("Unit draft saved")
  expect((await decideGeneralProposal(web, prepared.decision)).receipt).toEqual(
    saved.receipt,
  )
  expect(
    (
      await ctx.db.catalogProduct.findUniqueOrThrow({
        where: { id: product.id },
      })
    ).currentUnitConfigurationVersionId,
  ).toBe(product.currentUnitConfigurationVersionId)
  const draft = await ctx.db.unitConfigurationVersion.findFirstOrThrow({
    where: { productId: product.id, status: "DRAFT" },
  })
  const stale = await review({
    action: "product_unit_configuration_publish",
    catalogItemId: item.id,
  })
  await updateProductUnitConfigurationDraft(ctx.db, {
    tenantId: scope.tenantId,
    configurationId: draft.id,
    canonicalBalanceScale: 0,
    units: payload.units.map((unit) => ({
      ...unit,
      name: unit.key === "crate" ? "Twelve pieces" : unit.name,
    })),
  })
  await expect(decideGeneralProposal(web, stale.decision)).rejects.toThrow()
  expect(
    (
      await ctx.db.assistantActionProposal.findUniqueOrThrow({
        where: { id: stale.decision.proposalId },
      })
    ).status,
  ).toBe("PENDING")
  const ready = await review({
    action: "product_unit_configuration_publish",
    catalogItemId: item.id,
  })
  expect(ready.card.review?.join("\n")).toContain("Twelve pieces")
  const published = await decideGeneralProposal(web, ready.decision)
  expect(published.receipt?.title).toBe("Unit configuration published")
  expect((await decideGeneralProposal(web, ready.decision)).receipt).toEqual(
    published.receipt,
  )
  expect(
    (
      await ctx.db.catalogProduct.findUniqueOrThrow({
        where: { id: product.id },
      })
    ).currentUnitConfigurationVersionId,
  ).toBe(draft.id)
  expect(
    (
      await ctx.db.sellableOffering.findFirstOrThrow({
        where: { catalogItemId: item.id, status: "ACTIVE" },
      })
    ).fixedPriceMinor,
  ).toBe(19000)
}
