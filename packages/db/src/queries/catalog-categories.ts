import { createHash } from "node:crypto"
import { CATALOG_CATEGORY_PRESETS } from "@ewatrade/utils/catalog-category-presets"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  type CatalogPhotoActorScope,
  CatalogPhotoError,
  authorizeCatalogPhotoScope,
} from "./catalog-photos"

const normalized = (label: string) =>
  label.trim().replace(/\s+/g, " ").toLowerCase()
const customKey = (label: string) =>
  createHash("sha256").update(normalized(label)).digest("hex")

/** New writes materialize optional hierarchy. Existing flat labels are retained
 * without a historical backfill or invented parent for arbitrary slash text. */
export async function resolveCatalogCategorySelection(
  tx: Prisma.TransactionClient,
  input: CatalogPhotoActorScope & {
    category?: string
    categoryId?: string
    subcategoryId?: string
  },
) {
  const label = input.category?.trim() || null
  if (!label && !input.categoryId && !input.subcategoryId)
    return { category: null, categoryId: null, subcategoryId: null }
  await authorizeCatalogPhotoScope(tx, input)
  if (input.subcategoryId && !input.categoryId)
    throw new CatalogPhotoError(
      "INVALID_PHOTO",
      "Choose a category before its subcategory.",
    )
  if (input.categoryId) {
    const root = await tx.catalogCategory.findFirst({
      where: { id: input.categoryId, tenantId: input.tenantId, parentId: null },
    })
    const child = input.subcategoryId
      ? await tx.catalogCategory.findFirst({
          where: {
            id: input.subcategoryId,
            tenantId: input.tenantId,
            parentId: input.categoryId,
          },
        })
      : null
    if (!root || (input.subcategoryId && !child))
      throw new CatalogPhotoError(
        "INVALID_PHOTO",
        "Category does not belong to this business or parent.",
      )
    return {
      category: child ? `${root.label} / ${child.label}` : root.label,
      categoryId: root.id,
      subcategoryId: child?.id ?? null,
    }
  }
  if (!label || label.length > 120)
    throw new CatalogPhotoError(
      "INVALID_PHOTO",
      "Use a category of 120 characters or fewer.",
    )
  const preset = CATALOG_CATEGORY_PRESETS.find(
    (entry) =>
      normalized(entry.label) === normalized(label) ||
      normalized(label).startsWith(`${normalized(entry.label)} / `),
  )
  const rootLabel = preset?.label ?? label
  const childLabel =
    preset && label.includes(" / ")
      ? label.slice(label.indexOf(" / ") + 3).trim()
      : null
  const rootKey = preset
    ? `preset:${preset.key}`
    : `custom:${customKey(rootLabel)}`
  const root = await tx.catalogCategory.upsert({
    where: { tenantId_key: { tenantId: input.tenantId, key: rootKey } },
    create: {
      tenantId: input.tenantId,
      key: rootKey,
      label: rootLabel,
      normalizedLabel: normalized(rootLabel),
    },
    update: {},
  })
  const childPreset = preset?.subcategories.find(
    (entry) => normalized(entry.label) === normalized(childLabel ?? ""),
  )
  const child = childLabel
    ? await tx.catalogCategory.upsert({
        where: {
          tenantId_key: {
            tenantId: input.tenantId,
            key: childPreset
              ? `preset:${childPreset.key}`
              : `child:${root.id}:${customKey(childLabel)}`,
          },
        },
        create: {
          tenantId: input.tenantId,
          key: childPreset
            ? `preset:${childPreset.key}`
            : `child:${root.id}:${customKey(childLabel)}`,
          label: childLabel,
          normalizedLabel: normalized(childLabel),
          parentId: root.id,
        },
        update: {},
      })
    : null
  return {
    category: child ? `${root.label} / ${child.label}` : root.label,
    categoryId: root.id,
    subcategoryId: child?.id ?? null,
  }
}

export async function listCatalogCategories(
  db: PrismaClient,
  input: CatalogPhotoActorScope,
) {
  return db.$transaction(
    async (tx) => {
      await authorizeCatalogPhotoScope(tx, input)
      return tx.catalogCategory.findMany({
        where: { tenantId: input.tenantId, parentId: null },
        select: {
          id: true,
          key: true,
          label: true,
          children: {
            select: { id: true, key: true, label: true },
            orderBy: { label: "asc" },
          },
        },
        orderBy: { label: "asc" },
        take: 200,
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/** Read-only label preview uses the same preset/key rules as category resolution. */
export async function previewCatalogCategoryLabel(
  tx: Prisma.TransactionClient,
  tenantId: string,
  category: string | null,
) {
  const label = category?.trim()
  if (!label) return null
  const preset = CATALOG_CATEGORY_PRESETS.find(
    (entry) =>
      normalized(entry.label) === normalized(label) ||
      normalized(label).startsWith(`${normalized(entry.label)} / `),
  )
  const rootLabel = preset?.label ?? label
  const childLabel =
    preset && label.includes(" / ")
      ? label.slice(label.indexOf(" / ") + 3).trim()
      : null
  const rootKey = preset
    ? `preset:${preset.key}`
    : `custom:${customKey(rootLabel)}`
  const root = await tx.catalogCategory.findUnique({
    where: { tenantId_key: { tenantId, key: rootKey } },
  })
  if (!childLabel) return root?.label ?? rootLabel
  const childPreset = preset?.subcategories.find(
    (entry) => normalized(entry.label) === normalized(childLabel),
  )
  const childKey = childPreset
    ? `preset:${childPreset.key}`
    : root
      ? `child:${root.id}:${customKey(childLabel)}`
      : null
  const child = childKey
    ? await tx.catalogCategory.findUnique({
        where: { tenantId_key: { tenantId, key: childKey } },
      })
    : null
  return `${root?.label ?? rootLabel} / ${child?.label ?? childLabel}`
}
