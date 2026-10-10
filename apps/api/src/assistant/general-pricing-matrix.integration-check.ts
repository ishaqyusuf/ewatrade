import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { startGeneralConversation } from "@ewatrade/db/assistant-general"
import {
  createCatalogItem,
  createProductUnitConfigurationDraft,
  publishProductUnitConfiguration,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalWithReview,
} from "./general-proposals"

/** B03's explicit Big/Small x Piece/Crate independence acceptance matrix. */
export async function verifyPricingMatrix(ctx: GeneralContext) {
  const scope = {
    tenantId: ctx.tenantContext.tenant.id,
    storeId: ctx.tenantContext.activeStore?.id ?? "",
    actorUserId: ctx.session.user.id,
  }
  const item = await createCatalogItem(ctx.db, {
    ...scope,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Pricing matrix QA",
    unitConfiguration: {
      canonicalBalanceScale: 0,
      units: [
        {
          key: "piece",
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
    },
    optionGroups: [
      {
        key: "size",
        name: "Size",
        values: [
          { key: "big", label: "Big" },
          { key: "small", label: "Small" },
        ],
      },
    ],
    variants: [
      {
        selections: [{ groupKey: "size", valueKey: "big" }],
        key: "big",
        name: "Big",
        isDefault: true,
        offerings: [
          {
            key: "big-piece",
            name: "Piece",
            inventoryUnitKey: "piece",
            pricingPolicy: "fixed",
            fixedPriceMinor: 100,
          },
          {
            key: "big-crate",
            name: "Crate",
            inventoryUnitKey: "crate",
            pricingPolicy: "fixed",
            fixedPriceMinor: 1000,
          },
        ],
      },
      {
        selections: [{ groupKey: "size", valueKey: "small" }],
        key: "small",
        name: "Small",
        isDefault: false,
        offerings: [
          {
            key: "small-piece",
            name: "Piece",
            inventoryUnitKey: "piece",
            pricingPolicy: "fixed",
            fixedPriceMinor: 80,
          },
          {
            key: "small-crate",
            name: "Crate",
            inventoryUnitKey: "crate",
            pricingPolicy: "fixed",
            fixedPriceMinor: 800,
          },
        ],
      },
    ],
  })
  const web = {
    ...ctx,
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
  }
  const conversation = await startGeneralConversation(ctx.db, {
    ...scope,
    userId: scope.actorUserId,
  })
  async function prices() {
    const rows = await ctx.db.sellableOffering.findMany({
      where: { catalogItemId: item.id, status: "ACTIVE" },
      include: { variant: { select: { name: true } } },
    })
    return Object.fromEntries(
      rows.map((row) => [
        `${row.variant.name}/${row.name}`,
        row.fixedPriceMinor,
      ]),
    )
  }
  const expected: { [key: string]: number } = {
    "Big/Piece": 100,
    "Big/Crate": 1000,
    "Small/Piece": 80,
    "Small/Crate": 800,
  }
  expect(await prices()).toEqual(expected)
  for (const [key, amount] of [
    ["big-piece", 150],
    ["small-crate", 900],
  ] as const) {
    const offering = await ctx.db.sellableOffering.findFirstOrThrow({
      where: { catalogItemId: item.id, key },
    })
    const proposal = await draftGeneralProposal(web, conversation.id, {
      action: "product_price_update",
      offeringId: offering.id,
      priceMinor: amount,
      reason: "Independent variant/unit QA",
    })
    const row = await ctx.db.assistantActionProposal.findUniqueOrThrow({
      where: { id: proposal.proposalId },
    })
    const review = await generalProposalWithReview(web, row)
    if (!review.approvalToken) throw Error("Review unavailable")
    await decideGeneralProposal(web, {
      proposalId: row.id,
      revision: row.revision,
      decision: "confirm",
      approvalToken: review.approvalToken,
    })
    expected[key === "big-piece" ? "Big/Piece" : "Small/Crate"] = amount
    expect(await prices()).toEqual(expected)
  }
  const product = await ctx.db.catalogProduct.findUniqueOrThrow({
    where: { catalogItemId: item.id },
  })
  const draft = await createProductUnitConfigurationDraft(ctx.db, {
    tenantId: scope.tenantId,
    productId: product.id,
  })
  await publishProductUnitConfiguration(ctx.db, {
    ...scope,
    configurationId: draft.id,
  })
  expect(await prices()).toEqual(expected)
  expect(
    await ctx.db.sellableOffering.count({
      where: { catalogItemId: item.id, status: "ARCHIVED" },
    }),
  ).toBe(4)
  expect(
    await ctx.db.sellableOffering.count({
      where: { catalogItemId: item.id, status: "ACTIVE" },
    }),
  ).toBe(4)
}
