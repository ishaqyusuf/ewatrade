import type { PrismaClient } from "../../generated/prisma/client"
import {
  type CatalogPhotoActorScope,
  CatalogPhotoError,
  authorizeCatalogPhotoScope,
  getCatalogPhotoReadTarget,
} from "./catalog-photos"

const transactionOptions = { maxWait: 10_000, timeout: 30_000 } as const
const maxScannedPhotos = 500

export type CatalogPhotoGalleryEntry = {
  /** Most recently attached copy; read it through its own Store's preview. */
  assetId: string
  storeId: string
  /** Every Item (in the listed Stores) currently showing these exact bytes. */
  items: Array<{ catalogItemId: string; name: string; storeId: string }>
  storeIds: string[]
  /** These bytes are already on the target Item in the target Store. */
  onTargetItem: boolean
  attachedAt: Date | null
}

/**
 * "My images": approved photos already attached to Items in Stores the actor
 * manages. It only lists photos those managers can already read through the
 * Store preview, grouped by exact bytes; drafts and unattached uploads stay
 * private to their actor.
 */
export async function listCatalogPhotoGallery(
  db: PrismaClient,
  input: {
    actorUserId: string
    tenantId: string
    /** Stores the request context already authorized for Catalog management. */
    storeIds: string[]
    target?: { storeId: string; catalogItemId?: string }
    query?: string
    limit?: number
  },
): Promise<{ entries: CatalogPhotoGalleryEntry[]; truncated: boolean }> {
  const storeIds = [...new Set(input.storeIds)]
  if (!storeIds.length) return { entries: [], truncated: false }
  const limit = Math.min(Math.max(input.limit ?? 60, 1), 120)
  const rows = await db.$transaction(async (tx) => {
    // Re-check current membership and each Store under the transaction.
    for (const storeId of storeIds)
      await authorizeCatalogPhotoScope(tx, {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        storeId,
      })
    return tx.catalogPhotoAsset.findMany({
      where: {
        tenantId: input.tenantId,
        storeId: { in: storeIds },
        state: "APPROVED",
        catalogItemId: { not: null },
        bytesDeletedAt: null,
        storagePath: { not: null },
        uploadedAt: { not: null },
        catalogItem: { is: { archivedAt: null } },
      },
      select: {
        id: true,
        storeId: true,
        contentDigest: true,
        attachedAt: true,
        catalogItem: { select: { id: true, name: true } },
      },
      orderBy: [{ attachedAt: "desc" }, { id: "asc" }],
      take: maxScannedPhotos + 1,
    })
  }, transactionOptions)
  const truncatedScan = rows.length > maxScannedPhotos
  const groups = new Map<string, CatalogPhotoGalleryEntry>()
  for (const row of rows.slice(0, maxScannedPhotos)) {
    if (!row.catalogItem) continue
    let entry = groups.get(row.contentDigest)
    if (!entry) {
      entry = {
        assetId: row.id,
        storeId: row.storeId,
        items: [],
        storeIds: [],
        onTargetItem: false,
        attachedAt: row.attachedAt,
      }
      groups.set(row.contentDigest, entry)
    }
    if (
      !entry.items.some(
        (item) =>
          item.catalogItemId === row.catalogItem?.id &&
          item.storeId === row.storeId,
      )
    )
      entry.items.push({
        catalogItemId: row.catalogItem.id,
        name: row.catalogItem.name,
        storeId: row.storeId,
      })
    if (!entry.storeIds.includes(row.storeId)) entry.storeIds.push(row.storeId)
    if (
      input.target?.catalogItemId &&
      row.catalogItem.id === input.target.catalogItemId &&
      row.storeId === input.target.storeId
    )
      entry.onTargetItem = true
  }
  const query = input.query?.trim().toLocaleLowerCase()
  const all = [...groups.values()].filter(
    (entry) =>
      !query ||
      entry.items.some((item) => item.name.toLocaleLowerCase().includes(query)),
  )
  return {
    entries: all.slice(0, limit),
    truncated: truncatedScan || all.length > limit,
  }
}

/**
 * Source for copying a photo onto another Item. Only an approved photo that is
 * currently attached in a Store the actor manages qualifies; the copy gets its
 * own asset, bytes and review so detaching it never affects the source Item.
 */
export async function getCatalogPhotoReuseSource(
  db: PrismaClient,
  input: CatalogPhotoActorScope & { assetId: string },
) {
  const target = await getCatalogPhotoReadTarget(db, input)
  const asset = await db.catalogPhotoAsset.findFirst({
    where: {
      id: input.assetId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      state: "APPROVED",
      catalogItemId: { not: null },
      bytesDeletedAt: null,
      contentDigest: target.photo.contentDigest,
      storagePath: target.photo.storagePath,
    },
    select: { id: true },
  })
  if (!asset)
    throw new CatalogPhotoError(
      "PHOTO_NOT_READY",
      "This image is no longer available to reuse. Choose another one.",
    )
  return target
}
