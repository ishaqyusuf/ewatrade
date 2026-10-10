import { generalMoney } from "@ewatrade/assistant/general/contracts"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  createProductUnitConfigurationDraftInTransaction,
  publishProductUnitConfigurationInTransaction,
  updateProductUnitConfigurationDraftInTransaction,
} from "@ewatrade/db/queries"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { conflict } from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Draft = Extract<
  GeneralAction,
  { action: "product_unit_configuration_draft" }
>
type Publish = Extract<
  GeneralAction,
  { action: "product_unit_configuration_publish" }
>
async function unitTarget(
  ctx: GeneralTransactionContext,
  payload: Draft | Publish,
) {
  const scope = requireGeneralScope(ctx)
  const product = await ctx.db.catalogProduct.findFirst({
    where: {
      catalogItemId: payload.catalogItemId,
      catalogItem: {
        tenantId: scope.tenantId,
        kind: "PRODUCT",
        status: "ACTIVE",
      },
    },
    include: {
      currentUnitConfiguration: {
        include: { units: { orderBy: { sortOrder: "asc" } } },
      },
      unitConfigurations: {
        where: { status: "DRAFT" },
        include: { units: { orderBy: { sortOrder: "asc" } } },
        orderBy: { version: "desc" },
      },
      stockBalanceSources: {
        include: {
          store: { select: { name: true } },
          variant: { select: { name: true } },
          inventoryUnit: { select: { name: true } },
        },
        orderBy: { id: "asc" },
      },
      catalogItem: {
        include: {
          offerings: {
            where: { status: { in: ["ACTIVE", "DRAFT"] } },
            include: {
              variant: { select: { name: true } },
              productUnitOffering: { include: { inventoryUnit: true } },
              storeAvailability: { orderBy: { storeId: "asc" } },
            },
            orderBy: { id: "asc" },
          },
        },
      },
    },
  })
  if (!product?.currentUnitConfiguration)
    throw conflict(
      "Choose an active Product with a current unit configuration.",
    )
  if (product.unitConfigurations.length > 1)
    throw conflict(
      "Resolve the Product's multiple unit drafts in Catalog first.",
    )
  const draft = product.unitConfigurations[0]
  if (payload.action === "product_unit_configuration_publish" && !draft)
    throw conflict("Save a unit configuration draft before publishing.")
  // JSON serialization retains Date and Decimal values in the revision fence.
  const target = {
    id: product.id,
    revision: proposalDigest(JSON.parse(JSON.stringify(product))),
  }
  return { scope, product, draft, target }
}
function unitLine(unit: {
  name: string
  key: string
  factor: unknown
  stockBehavior: string
  transactionScale: number
}) {
  const behavior = unit.stockBehavior.toLowerCase()
  const label =
    behavior === "canonical_shared"
      ? "Main unit"
      : behavior === "alternate_transaction"
        ? "Shared selling unit"
        : "Independent Packaged Stock"
  return `${unit.name}: ${String(unit.factor)} main units per ${unit.name} · ${label} · ${unit.transactionScale} decimal places`
}
async function reviewUnits(
  ctx: GeneralTransactionContext,
  payload: Draft | Publish,
) {
  const { product, draft, target } = await unitTarget(ctx, payload)
  const current = product.currentUnitConfiguration
  const next =
    payload.action === "product_unit_configuration_draft" ? payload : draft
  if (!current || !next) throw conflict("Unit configuration unavailable")
  const affected = product.catalogItem.offerings.filter(
    (offering) =>
      offering.productUnitOffering?.inventoryUnit.configurationVersionId ===
      current.id,
  )
  const lines = [
    product.catalogItem.name,
    payload.action === "product_unit_configuration_draft"
      ? "Save a Draft only. Selling configuration stays unchanged until a separate publish confirmation."
      : `Publish Draft v${draft?.version}; Current v${current.version} becomes Superseded.`,
    "Applies across this business's Stores. Past orders retain their saved configuration and prices.",
    `Current balance precision: ${current.canonicalBalanceScale}; proposed: ${next.canonicalBalanceScale}.`,
    ...current.units.map((unit) => `Current — ${unitLine(unit)}`),
    ...next.units.map((unit) => `Proposed — ${unitLine(unit)}`),
    `${affected.length} affected selling offerings. Publication replaces their unit references and carries each offering's own price, identifiers and Store availability forward.`,
    ...affected.map(
      (offering) =>
        `${offering.variant.name} · ${offering.name}: ${offering.fixedPriceMinor === null ? "no fixed price" : generalMoney(offering.fixedPriceMinor, offering.currencyCode)} · unit ${offering.productUnitOffering?.inventoryUnit.key ?? "unconfigured"}`,
    ),
    `${product.stockBalanceSources.length} stock balance sources; no quantity is converted automatically.`,
    ...product.stockBalanceSources.map(
      (balance) =>
        `${balance.store.name} · ${balance.variant.name} · ${balance.inventoryUnit.name}: on hand ${balance.onHandQuantity}, reserved ${balance.reservedQuantity} (${balance.custodyType}).`,
    ),
    "Semantic changes with stock or reservations require a separate explicit Stock Transition. Publication rechecks this rule.",
  ]
  if (payload.action === "product_unit_configuration_draft" && draft)
    lines.splice(
      2,
      0,
      `Replaces the existing Draft v${draft.version}; this is not an additional draft.`,
      ...draft.units.map((unit) => `Existing Draft — ${unitLine(unit)}`),
    )
  if (
    payload.action === "product_unit_configuration_publish" &&
    payload.stockTransitionOperationId
  )
    lines.push(
      `Existing Stock Transition: ${payload.stockTransitionOperationId}. No new transition is created by this proposal.`,
    )
  return { target, lines }
}
export const productUnitConfigurationDraft: GeneralActionAdapter<Draft> = {
  validate: async (ctx, payload) => (await unitTarget(ctx, payload)).target,
  review: reviewUnits,
  stale:
    "Product units, draft, stock or offerings changed. Edit and review again.",
  unavailable: "The unit draft cannot be prepared for this Product.",
  async execute(ctx, payload) {
    const { scope, product } = await unitTarget(ctx, payload)
    const draft = await createProductUnitConfigurationDraftInTransaction(
      ctx.db,
      { tenantId: scope.tenantId, productId: product.id },
    )
    await updateProductUnitConfigurationDraftInTransaction(ctx.db, {
      tenantId: scope.tenantId,
      configurationId: draft.id,
      canonicalBalanceScale: payload.canonicalBalanceScale,
      units: payload.units,
    })
    return {
      kind: "product",
      recordId: payload.catalogItemId,
      title: "Unit draft saved",
      detail: `${product.catalogItem.name} · Draft v${draft.version} · review and publish separately`,
    }
  },
}
export const productUnitConfigurationPublish: GeneralActionAdapter<Publish> = {
  validate: async (ctx, payload) => (await unitTarget(ctx, payload)).target,
  review: reviewUnits,
  stale:
    "Product units, draft, stock or offerings changed. Review publication again.",
  unavailable: "The unit draft cannot be published for this Product.",
  async execute(ctx, payload) {
    const { scope, product, draft } = await unitTarget(ctx, payload)
    if (!draft) throw conflict("Unit draft unavailable")
    const published = await publishProductUnitConfigurationInTransaction(
      ctx.db,
      {
        tenantId: scope.tenantId,
        actorUserId: scope.userId,
        configurationId: draft.id,
        stockTransitionOperationId: payload.stockTransitionOperationId,
      },
    )
    return {
      kind: "product",
      recordId: payload.catalogItemId,
      title: "Unit configuration published",
      detail: `${product.catalogItem.name} · Current v${published.version} · past orders unchanged`,
    }
  },
}
