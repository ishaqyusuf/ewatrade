import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { CatalogPhotoError } from "@ewatrade/db/catalog-photos"
import {
  CatalogError,
  previewCatalogCategoryLabel,
  productDetailsPatch,
  productIdentifiersPatch,
  updateProductDetailsInTransaction,
  updateProductIdentifiersInTransaction,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import {
  type FieldChange,
  productDetailsPresentation,
  productIdentifiersPresentation,
} from "./catalog-review-presentations"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Details = Extract<GeneralAction, { action: "product_details_update" }>
type Identifiers = Extract<
  GeneralAction,
  { action: "product_identifiers_update" }
>
const display = (value: string | null | undefined) =>
  value ? JSON.stringify(value) : "Not set"
const fieldLabel: Record<string, string> = {
  name: "Name",
  description: "Description",
  category: "Category",
  sku: "SKU",
  barcode: "Barcode",
}
/** The fields that change, as card rows and as review lines. */
function diff(
  current: Record<string, string | null>,
  patch: Record<string, string | null | undefined>,
) {
  const changed = Object.entries(patch).flatMap(([key, value]) =>
    value !== undefined && value !== current[key]
      ? [{ key, before: current[key] ?? null, after: value ?? null }]
      : [],
  )
  if (!changed.length)
    throw new TRPCError({
      code: "CONFLICT",
      message: "These details are already saved.",
    })
  return {
    lines: changed.map(
      (c) => `${c.key}: ${display(c.before)} → ${display(c.after)}`,
    ),
    changes: changed.map(
      (c): FieldChange => ({
        label: fieldLabel[c.key] ?? c.key,
        before: c.before,
        after: c.after,
      }),
    ),
  }
}
async function detailsTarget(ctx: GeneralTransactionContext, payload: Details) {
  const { tenantId } = requireGeneralScope(ctx)
  const item = await ctx.db.catalogItem.findFirst({
    where: {
      id: payload.catalogItemId,
      tenantId,
      kind: "PRODUCT",
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      categoryId: true,
      subcategoryId: true,
      updatedAt: true,
    },
  })
  if (!item)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Choose an active product.",
    })
  const patch = productDetailsPatch(payload)
  if (patch.category !== undefined)
    patch.category = await previewCatalogCategoryLabel(
      ctx.db,
      tenantId,
      patch.category,
    )
  const { lines, changes } = diff(
    { name: item.name, description: item.description, category: item.category },
    patch,
  )
  return {
    item,
    lines,
    changes,
    target: {
      id: item.id,
      revision: proposalDigest(
        JSON.stringify({ item, category: patch.category }),
      ),
    },
  }
}
function commandError(error: unknown): never {
  if (error instanceof CatalogError || error instanceof CatalogPhotoError)
    throw new TRPCError({ code: "CONFLICT", message: error.message })
  throw error
}
export const productDetailsUpdate: GeneralActionAdapter<Details> = {
  validate: async (ctx, payload) => (await detailsTarget(ctx, payload)).target,
  async review(ctx, payload) {
    const { item, lines, changes, target } = await detailsTarget(ctx, payload)
    return {
      target,
      presentation: productDetailsPresentation(item.name, changes),
      lines: [
        item.name,
        ...lines,
        "Applies to this product in every Store. Past orders and product links stay unchanged.",
      ],
    }
  },
  stale: "This product changed. Edit and review the latest details again.",
  unavailable: "This product update is unavailable or already saved.",
  async execute(ctx, payload) {
    const scope = requireGeneralScope(ctx)
    const { item } = await detailsTarget(ctx, payload)
    try {
      const result = await updateProductDetailsInTransaction(ctx.db, {
        ...payload,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        actorUserId: scope.userId,
        expectedUpdatedAt: item.updatedAt.toISOString(),
      })
      return {
        kind: "product",
        recordId: item.id,
        title: "Product details updated",
        detail: `${payload.name ?? item.name} · ${result.changes.map((c) => c.field).join(", ")} changed`,
      }
    } catch (error) {
      return commandError(error)
    }
  },
}
async function identifiersTarget(
  ctx: GeneralTransactionContext,
  payload: Identifiers,
) {
  const { tenantId } = requireGeneralScope(ctx)
  const offering = await ctx.db.sellableOffering.findFirst({
    where: {
      id: payload.offeringId,
      tenantId,
      kind: "PRODUCT_UNIT",
      status: "ACTIVE",
      catalogItem: { kind: "PRODUCT", status: "ACTIVE" },
      variant: { status: "ACTIVE" },
    },
    select: {
      id: true,
      catalogItemId: true,
      name: true,
      revision: true,
      updatedAt: true,
      catalogItem: { select: { name: true, updatedAt: true } },
      variant: { select: { name: true, updatedAt: true } },
      productUnitOffering: {
        select: { id: true, sku: true, barcode: true, updatedAt: true },
      },
    },
  })
  if (!offering?.productUnitOffering)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Choose an active product selling unit.",
    })
  const unit = offering.productUnitOffering
  return {
    offering,
    ...diff(
      { sku: unit.sku, barcode: unit.barcode },
      productIdentifiersPatch(payload),
    ),
    target: {
      id: offering.id,
      revision: proposalDigest(JSON.stringify(offering)),
    },
  }
}
export const productIdentifiersUpdate: GeneralActionAdapter<Identifiers> = {
  validate: async (ctx, payload) =>
    (await identifiersTarget(ctx, payload)).target,
  async review(ctx, payload) {
    const { offering, lines, changes, target } = await identifiersTarget(
      ctx,
      payload,
    )
    return {
      target,
      presentation: productIdentifiersPresentation(
        {
          itemName: offering.catalogItem.name,
          variantName: offering.variant.name,
          name: offering.name,
        },
        changes,
      ),
      lines: [
        `${offering.catalogItem.name} · ${offering.variant.name} · ${offering.name}`,
        ...lines,
        "Only this selling unit changes, in every Store. Other variants, units and past orders stay unchanged.",
      ],
    }
  },
  stale:
    "This selling unit changed. Edit and review the latest identifiers again.",
  unavailable: "This identifier update is unavailable or already saved.",
  async execute(ctx, payload) {
    const { tenantId } = requireGeneralScope(ctx)
    const { offering } = await identifiersTarget(ctx, payload)
    try {
      const result = await updateProductIdentifiersInTransaction(ctx.db, {
        ...payload,
        tenantId,
        expectedRevision: offering.revision,
      })
      return {
        kind: "product",
        recordId: offering.catalogItemId,
        title: "Product identifiers updated",
        detail: `${offering.catalogItem.name} · ${offering.name} · ${result.changes.map((c) => c.field).join(", ")} changed`,
      }
    } catch (error) {
      return commandError(error)
    }
  },
}
