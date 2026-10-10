import { Prisma } from "../../generated/prisma/client"
import { resolveCatalogCategorySelection } from "./catalog-categories"
import { CatalogError } from "./catalog-errors"
import type { CatalogPhotoActorScope } from "./catalog-photos"

export type ProductDetailsPatch = {
  name?: string
  description?: string | null
  category?: string | null
}
export type ProductIdentifiersPatch = {
  sku?: string | null
  barcode?: string | null
}

function text(value: string | null | undefined, max: number) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string" || value.trim().length > max)
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Enter valid product details.",
    )
  return value.trim() || null
}

export function productDetailsPatch(input: ProductDetailsPatch) {
  const name = text(input.name, 160)
  if (name === null)
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Product name cannot be empty.",
    )
  return {
    name,
    description: text(input.description, 2_000),
    category: text(input.category, 120),
  }
}
export function productIdentifiersPatch(input: ProductIdentifiersPatch) {
  return { sku: text(input.sku, 120), barcode: text(input.barcode, 120) }
}

function changes<T extends Record<string, string | null | undefined>>(
  current: T,
  patch: T,
) {
  return Object.entries(patch).flatMap(([field, after]) =>
    after !== undefined && after !== current[field]
      ? [{ field, before: current[field] ?? null, after }]
      : [],
  )
}

/** Caller authorizes Catalog management and owns this transaction. */
export async function updateProductDetailsInTransaction(
  tx: Prisma.TransactionClient,
  input: CatalogPhotoActorScope &
    ProductDetailsPatch & {
      catalogItemId: string
      expectedUpdatedAt: string
    },
) {
  const patch = productDetailsPatch(input)
  const current = await tx.catalogItem.findFirst({
    where: {
      id: input.catalogItemId,
      tenantId: input.tenantId,
      kind: "PRODUCT",
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      updatedAt: true,
    },
  })
  if (!current)
    throw new CatalogError(
      "CATALOG_ITEM_NOT_FOUND",
      "Choose an active product.",
    )
  if (current.updatedAt.toISOString() !== input.expectedUpdatedAt)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "This product changed. Review its latest details.",
    )
  const category =
    patch.category === undefined
      ? null
      : await resolveCatalogCategorySelection(tx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          storeId: input.storeId,
          category: patch.category ?? undefined,
        })
  const diff = changes(
    {
      name: current.name,
      description: current.description,
      category: current.category,
    },
    {
      ...patch,
      ...(category ? { category: category.category } : {}),
    },
  )
  if (!diff.length)
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "These product details are already saved.",
    )
  const updatedAt = new Date(
    Math.max(Date.now(), current.updatedAt.getTime() + 1),
  )
  const saved = await tx.catalogItem.updateMany({
    where: {
      id: current.id,
      tenantId: input.tenantId,
      kind: "PRODUCT",
      status: "ACTIVE",
      updatedAt: current.updatedAt,
    },
    data: {
      name: patch.name,
      description: patch.description,
      ...category,
      updatedAt,
    },
  })
  if (saved.count !== 1)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "This product changed. Review its latest details.",
    )
  return {
    catalogItemId: current.id,
    updatedAt: updatedAt.toISOString(),
    changes: diff,
  }
}

/** Identifiers belong to one selling unit, not every variant of a product. */
export async function updateProductIdentifiersInTransaction(
  tx: Prisma.TransactionClient,
  input: ProductIdentifiersPatch & {
    tenantId: string
    offeringId: string
    expectedRevision: number
  },
) {
  const patch = productIdentifiersPatch(input)
  const current = await tx.sellableOffering.findFirst({
    where: {
      id: input.offeringId,
      tenantId: input.tenantId,
      kind: "PRODUCT_UNIT",
      status: "ACTIVE",
      catalogItem: { kind: "PRODUCT", status: "ACTIVE" },
      variant: { status: "ACTIVE" },
    },
    select: {
      id: true,
      catalogItemId: true,
      revision: true,
      productUnitOffering: {
        select: { id: true, sku: true, barcode: true, updatedAt: true },
      },
    },
  })
  if (!current?.productUnitOffering)
    throw new CatalogError(
      "CATALOG_OFFERING_NOT_FOUND",
      "Choose an active product selling unit.",
    )
  if (current.revision !== input.expectedRevision)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "This selling unit changed. Review its latest identifiers.",
    )
  const unit = current.productUnitOffering
  const diff = changes({ sku: unit.sku, barcode: unit.barcode }, patch)
  if (!diff.length)
    throw new CatalogError(
      "INVALID_OFFERING",
      "These identifiers are already saved.",
    )
  const saved = await tx.sellableOffering.updateMany({
    where: {
      id: current.id,
      tenantId: input.tenantId,
      revision: current.revision,
      status: "ACTIVE",
      catalogItem: { kind: "PRODUCT", status: "ACTIVE" },
      variant: { status: "ACTIVE" },
    },
    data: { revision: { increment: 1 } },
  })
  if (saved.count !== 1)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "This selling unit changed. Review its latest identifiers.",
    )
  try {
    const identifiers = await tx.productUnitOffering.updateMany({
      where: {
        id: unit.id,
        tenantId: input.tenantId,
        offeringId: current.id,
        updatedAt: unit.updatedAt,
      },
      data: patch,
    })
    if (identifiers.count !== 1)
      throw new CatalogError(
        "REVISION_CONFLICT",
        "These identifiers changed. Review them again.",
      )
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new CatalogError(
        "DUPLICATE_CATALOG_KEY",
        "Another selling unit already uses this SKU or barcode.",
      )
    throw error
  }
  return {
    catalogItemId: current.catalogItemId,
    offeringId: current.id,
    revision: current.revision + 1,
    changes: diff,
  }
}
