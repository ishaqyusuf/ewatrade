import { expect } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  updateProductDetailsInTransaction,
  updateProductIdentifiersInTransaction,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
  generalProposalWithReview,
} from "./general-proposals"

export async function verifyGeneralProductDetails(
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
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId) throw Error("Missing fixture Store")
  const offering = await db.sellableOffering.findUniqueOrThrow({
    where: { id: offeringId },
    include: { productUnitOffering: true },
  })
  const original = await db.catalogItem.findUniqueOrThrow({
    where: { id: offering.catalogItemId },
  })
  const draft = async (payload: GeneralAction) => {
    const created = await draftGeneralProposal(web, conversationId, payload)
    const row = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: created.proposalId },
    })
    const app = generalProposalForApp(row)
    return {
      row,
      command: {
        proposalId: app.id,
        revision: app.revision,
        decision: "confirm" as const,
        approvalToken: app.approvalToken,
      },
    }
  }
  const details = await draft({
    action: "product_details_update",
    catalogItemId: original.id,
    name: "Reviewed product name",
    description: "Fresh product description",
    category: "QA produce",
  })
  expect(
    (await generalProposalWithReview(web, details.row)).review?.join(" "),
  ).toContain("name:")
  await expect(
    decideGeneralProposal({ ...web, db: failingDb }, details.command),
  ).rejects.toThrow("Injected receipt failure")
  expect(
    (await db.catalogItem.findUniqueOrThrow({ where: { id: original.id } }))
      .name,
  ).toBe(original.name)
  const result = await decideGeneralProposal(web, details.command)
  expect(result.receipt?.title).toBe("Product details updated")
  expect((await decideGeneralProposal(web, details.command)).receipt).toEqual(
    result.receipt,
  )
  const saved = await db.catalogItem.findUniqueOrThrow({
    where: { id: original.id },
  })
  expect(saved).toMatchObject({
    name: "Reviewed product name",
    description: "Fresh product description",
    category: "QA produce",
    slug: original.slug,
  })
  expect(saved.categoryId).not.toBeNull()
  const line = await db.commercialOrderLine.findFirstOrThrow({
    where: { orderId, offeringId },
    include: { snapshot: true },
  })
  expect(line.snapshot?.catalogItemName).toBe(original.name)
  const stale = await draft({
    action: "product_details_update",
    catalogItemId: original.id,
    name: "Stale name",
  })
  await db.$transaction((tx) =>
    updateProductDetailsInTransaction(tx, {
      tenantId: original.tenantId,
      storeId: storeId,
      actorUserId: ctx.session.user.id,
      catalogItemId: original.id,
      expectedUpdatedAt: saved.updatedAt.toISOString(),
      description: null,
    }),
  )
  await expect(decideGeneralProposal(web, stale.command)).rejects.toMatchObject(
    { code: "CONFLICT" },
  )
  const identifiers = await draft({
    action: "product_identifiers_update",
    offeringId,
    sku: "QA-SKU-ONE",
    barcode: "QA-BARCODE-ONE",
  })
  await expect(
    decideGeneralProposal({ ...web, db: failingDb }, identifiers.command),
  ).rejects.toThrow("Injected receipt failure")
  expect(
    (await db.productUnitOffering.findUniqueOrThrow({ where: { offeringId } }))
      .sku,
  ).toBe(offering.productUnitOffering?.sku ?? null)
  const updated = await decideGeneralProposal(web, identifiers.command)
  expect(updated.receipt?.title).toBe("Product identifiers updated")
  expect(
    (await decideGeneralProposal(web, identifiers.command)).receipt,
  ).toEqual(updated.receipt)
  expect(
    await db.productUnitOffering.findUniqueOrThrow({ where: { offeringId } }),
  ).toMatchObject({ sku: "QA-SKU-ONE", barcode: "QA-BARCODE-ONE" })
  if (!offering.productUnitOffering) throw Error("Missing fixture unit")
  const sibling = await db.sellableOffering.create({
    data: {
      tenantId: offering.tenantId,
      catalogItemId: offering.catalogItemId,
      variantId: offering.variantId,
      key: "qa-sibling",
      kind: "PRODUCT_UNIT",
      status: "ACTIVE",
      name: "Other unit",
      pricingPolicy: "FIXED",
      fixedPriceMinor: 9999,
      currencyCode: offering.currencyCode,
      productUnitOffering: {
        create: {
          tenantId: offering.tenantId,
          inventoryUnitId: offering.productUnitOffering.inventoryUnitId,
          sku: "QA-SKU-TWO",
        },
      },
    },
  })
  await expect(
    db.$transaction((tx) =>
      updateProductIdentifiersInTransaction(tx, {
        tenantId: offering.tenantId,
        offeringId: sibling.id,
        expectedRevision: sibling.revision,
        sku: "QA-SKU-ONE",
      }),
    ),
  ).rejects.toMatchObject({ code: "DUPLICATE_CATALOG_KEY" })
  expect(
    await db.sellableOffering.findUniqueOrThrow({
      where: { id: sibling.id },
      include: { productUnitOffering: true },
    }),
  ).toMatchObject({
    revision: 0,
    fixedPriceMinor: 9999,
    productUnitOffering: { sku: "QA-SKU-TWO" },
  })
  const staleIdentifiers = await draft({
    action: "product_identifiers_update",
    offeringId,
    barcode: "STALE",
  })
  const current = await db.sellableOffering.findUniqueOrThrow({
    where: { id: offeringId },
  })
  await db.$transaction((tx) =>
    updateProductIdentifiersInTransaction(tx, {
      tenantId: offering.tenantId,
      offeringId,
      expectedRevision: current.revision,
      barcode: null,
    }),
  )
  await expect(
    decideGeneralProposal(web, staleIdentifiers.command),
  ).rejects.toMatchObject({ code: "CONFLICT" })
}
