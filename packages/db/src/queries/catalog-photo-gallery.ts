import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CATALOG_GALLERY_KEEP_UNTIL,
  type CatalogPhotoActorScope,
  CatalogPhotoError,
  authorizeCatalogPhotoScope,
  getCatalogPhotoReadTarget,
} from "./catalog-photos"

const transactionOptions = { maxWait: 10_000, timeout: 30_000 } as const
const maxDetailRows = 1_000
export const CATALOG_GALLERY_TITLE_MAX = 80
export const CATALOG_GALLERY_CATEGORY_MAX = 40

export type CatalogPhotoGalleryEntry = {
  /** Most recently used copy; read it through its own Store's preview. */
  assetId: string
  storeId: string
  /** Every Item (in the listed Stores) currently showing these exact bytes. */
  items: Array<{ catalogItemId: string; name: string; storeId: string }>
  storeIds: string[]
  /** These bytes are already on the target Item in the target Store. */
  onTargetItem: boolean
  attachedAt: Date | null
  title: string | null
  category: string | null
  /**
   * The gallery-only upload holding these bytes, if any. Removing it takes
   * the image out of My images unless an Item still shows it.
   */
  galleryAsset: { assetId: string; storeId: string } | null
  /** Only the uploader sees their own gallery upload before it is approved. */
  state: "APPROVED" | "PENDING_REVIEW" | "REJECTED"
}

/** Rows My images may show: approved photos on live Items, approved
 * gallery-only uploads, and the actor's own gallery uploads still in review
 * (or rejected within the last day). */
function visibleAssets(
  actorUserId: string,
): Prisma.CatalogPhotoAssetWhereInput {
  return {
    bytesDeletedAt: null,
    storagePath: { not: null },
    uploadedAt: { not: null },
    OR: [
      {
        state: "APPROVED",
        catalogItemId: { not: null },
        catalogItem: { is: { archivedAt: null } },
      },
      { state: "APPROVED", galleryAddedAt: { not: null } },
      {
        actorUserId,
        state: "PENDING_REVIEW",
        galleryAddedAt: { not: null },
      },
      {
        actorUserId,
        state: "REJECTED",
        galleryAddedAt: { not: null },
        expiresAt: { gt: new Date() },
      },
    ],
  }
}

function visibleSql(actorUserId: string) {
  return Prisma.sql`a."bytesDeletedAt" IS NULL AND a."storagePath" IS NOT NULL AND a."uploadedAt" IS NOT NULL AND (
    (a."state"='APPROVED' AND a."catalogItemId" IS NOT NULL AND i."id" IS NOT NULL AND i."archivedAt" IS NULL)
    OR (a."galleryAddedAt" IS NOT NULL AND (a."state"='APPROVED'
      OR (a."actorUserId"=${actorUserId} AND (a."state"='PENDING_REVIEW'
        OR (a."state"='REJECTED' AND a."expiresAt">NOW()))))))`
}

/** Collapses whitespace; blank becomes null. Throws when too long. */
export function normalizeCatalogGalleryText(
  value: string | null | undefined,
  max: number,
  label: string,
) {
  if (value === undefined) return undefined
  const text = value?.replace(/\s+/g, " ").trim() ?? ""
  if (text.length > max)
    throw new CatalogPhotoError(
      "INVALID_PHOTO",
      `${label} can be at most ${max} characters.`,
    )
  return text || null
}

function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

type Cursor = { at: Date; digest: string }

function encodeCursor(cursor: Cursor) {
  return Buffer.from(
    `${cursor.at.toISOString()}|${cursor.digest}`,
    "utf8",
  ).toString("base64url")
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null
  const [at, digest] = Buffer.from(value, "base64url")
    .toString("utf8")
    .split("|")
  const date = new Date(at ?? "")
  if (!digest || !/^[a-f0-9]{64}$/.test(digest) || Number.isNaN(date.getTime()))
    throw new CatalogPhotoError("INVALID_PHOTO", "Invalid My images page.")
  return { at: date, digest }
}

/**
 * "My images": photos already on Items in Stores the actor manages plus
 * gallery-only uploads, grouped by exact bytes. Search matches the image
 * title, category and the names of the Items using it. Pages are keyed on
 * (last used, bytes), newest first.
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
    category?: string
    cursor?: string
    limit?: number
  },
): Promise<{
  entries: CatalogPhotoGalleryEntry[]
  nextCursor: string | null
  /** Categories in use across these Stores (first page only). */
  categories: Array<{ name: string; count: number }>
}> {
  const storeIds = [...new Set(input.storeIds)]
  if (!storeIds.length) return { entries: [], nextCursor: null, categories: [] }
  const limit = Math.min(Math.max(input.limit ?? 36, 1), 60)
  const cursor = decodeCursor(input.cursor)
  const query = input.query?.trim()
  const category = input.category?.trim()
  return db.$transaction(async (tx) => {
    // Re-check current membership and each Store under the transaction.
    for (const storeId of storeIds)
      await authorizeCatalogPhotoScope(tx, {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        storeId,
      })
    const usedAt = Prisma.sql`MAX(COALESCE(a."attachedAt", a."galleryAddedAt", a."uploadedAt"))`
    const pattern = query ? likePattern(query) : null
    const pages = await tx.$queryRaw<
      Array<{ contentDigest: string; usedAt: Date }>
    >(Prisma.sql`
      SELECT a."contentDigest", ${usedAt} AS "usedAt"
      FROM "CatalogPhotoAsset" a
      LEFT JOIN "CatalogItem" i ON i."tenantId"=a."tenantId" AND i."id"=a."catalogItemId"
      LEFT JOIN "CatalogGalleryImage" g ON g."tenantId"=a."tenantId" AND g."contentDigest"=a."contentDigest"
      WHERE a."tenantId"=${input.tenantId} AND a."storeId" IN (${Prisma.join(storeIds)})
        AND ${visibleSql(input.actorUserId)}
        ${
          pattern
            ? Prisma.sql`AND (g."title" ILIKE ${pattern} OR g."category" ILIKE ${pattern} OR i."name" ILIKE ${pattern})`
            : Prisma.empty
        }
        ${category ? Prisma.sql`AND lower(g."category")=lower(${category})` : Prisma.empty}
      GROUP BY a."contentDigest"
      ${
        cursor
          ? Prisma.sql`HAVING (${usedAt} < ${cursor.at} OR (${usedAt} = ${cursor.at} AND a."contentDigest" > ${cursor.digest}))`
          : Prisma.empty
      }
      ORDER BY "usedAt" DESC, a."contentDigest" ASC
      LIMIT ${limit + 1}
    `)
    const page = pages.slice(0, limit)
    const last = page.at(-1)
    const nextCursor =
      pages.length > limit && last
        ? encodeCursor({ at: last.usedAt, digest: last.contentDigest })
        : null
    const digests = page.map((row) => row.contentDigest)
    const [rows, details, target, categories] = digests.length
      ? await Promise.all([
          tx.catalogPhotoAsset.findMany({
            where: {
              ...visibleAssets(input.actorUserId),
              tenantId: input.tenantId,
              storeId: { in: storeIds },
              contentDigest: { in: digests },
            },
            select: {
              id: true,
              storeId: true,
              state: true,
              contentDigest: true,
              attachedAt: true,
              galleryAddedAt: true,
              uploadedAt: true,
              catalogItem: { select: { id: true, name: true } },
            },
            orderBy: [{ attachedAt: "desc" }, { id: "asc" }],
            take: maxDetailRows,
          }),
          tx.catalogGalleryImage.findMany({
            where: { tenantId: input.tenantId, contentDigest: { in: digests } },
            select: { contentDigest: true, title: true, category: true },
          }),
          // Copies still waiting for their image check are already on the item too.
          input.target?.catalogItemId
            ? tx.catalogPhotoAsset.findMany({
                where: {
                  tenantId: input.tenantId,
                  storeId: input.target.storeId,
                  catalogItemId: input.target.catalogItemId,
                  state: { in: ["PENDING_REVIEW", "APPROVED"] },
                },
                select: { contentDigest: true },
              })
            : [],
          cursor
            ? []
            : listCategories(tx, input.tenantId, storeIds, input.actorUserId),
        ])
      : [
          [],
          [],
          [],
          cursor
            ? []
            : await listCategories(
                tx,
                input.tenantId,
                storeIds,
                input.actorUserId,
              ),
        ]
    const targetDigests = new Set(target.map((row) => row.contentDigest))
    const metadata = new Map(details.map((row) => [row.contentDigest, row]))
    const groups = new Map<string, CatalogPhotoGalleryEntry>()
    for (const digest of digests) {
      const copies = rows.filter((row) => row.contentDigest === digest)
      // Prefer an approved copy, newest use first.
      const representative =
        copies
          .filter((row) => row.state === "APPROVED")
          .sort(
            (a, b) => usedTime(b) - usedTime(a) || a.id.localeCompare(b.id),
          )[0] ?? copies[0]
      if (!representative) continue
      const gallery = copies.find((row) => row.galleryAddedAt)
      const entry: CatalogPhotoGalleryEntry = {
        assetId: representative.id,
        storeId: representative.storeId,
        items: [],
        storeIds: [],
        onTargetItem: targetDigests.has(digest),
        attachedAt:
          copies.find((row) => row.attachedAt)?.attachedAt ??
          representative.galleryAddedAt,
        title: metadata.get(digest)?.title ?? null,
        category: metadata.get(digest)?.category ?? null,
        galleryAsset: gallery
          ? { assetId: gallery.id, storeId: gallery.storeId }
          : null,
        state:
          representative.state === "PENDING_REVIEW" ||
          representative.state === "REJECTED"
            ? representative.state
            : "APPROVED",
      }
      for (const row of copies) {
        if (!entry.storeIds.includes(row.storeId))
          entry.storeIds.push(row.storeId)
        if (
          row.catalogItem &&
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
      }
      groups.set(digest, entry)
    }
    return { entries: [...groups.values()], nextCursor, categories }
  }, transactionOptions)
}

function usedTime(row: {
  attachedAt: Date | null
  galleryAddedAt: Date | null
  uploadedAt: Date | null
}) {
  return (
    (row.attachedAt ?? row.galleryAddedAt ?? row.uploadedAt)?.getTime() ?? 0
  )
}

async function listCategories(
  tx: Prisma.TransactionClient,
  tenantId: string,
  storeIds: string[],
  actorUserId: string,
) {
  const rows = await tx.$queryRaw<Array<{ name: string; count: bigint }>>(
    Prisma.sql`
      SELECT g."category" AS "name", COUNT(*) AS "count"
      FROM "CatalogGalleryImage" g
      WHERE g."tenantId"=${tenantId} AND g."category" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "CatalogPhotoAsset" a
          LEFT JOIN "CatalogItem" i ON i."tenantId"=a."tenantId" AND i."id"=a."catalogItemId"
          WHERE a."tenantId"=g."tenantId" AND a."contentDigest"=g."contentDigest"
            AND a."storeId" IN (${Prisma.join(storeIds)}) AND ${visibleSql(actorUserId)}
        )
      GROUP BY g."category"
      ORDER BY COUNT(*) DESC, g."category" ASC
      LIMIT 24
    `,
  )
  return rows.map((row) => ({ name: row.name, count: Number(row.count) }))
}

/** Locks one My images asset the actor may see, in a Store they manage. */
async function findVisibleGalleryAsset(
  tx: Prisma.TransactionClient,
  input: CatalogPhotoActorScope & { assetId: string },
) {
  await authorizeCatalogPhotoScope(tx, input)
  const asset = await tx.catalogPhotoAsset.findFirst({
    where: {
      ...visibleAssets(input.actorUserId),
      id: input.assetId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: { id: true, contentDigest: true },
  })
  if (!asset)
    throw new CatalogPhotoError(
      "PHOTO_NOT_FOUND",
      "This image is no longer in My images.",
    )
  return asset
}

async function writeGalleryDetails(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    contentDigest: string
    actorUserId: string
    title?: string | null
    category?: string | null
  },
) {
  const title = normalizeCatalogGalleryText(
    input.title,
    CATALOG_GALLERY_TITLE_MAX,
    "Title",
  )
  const category = normalizeCatalogGalleryText(
    input.category,
    CATALOG_GALLERY_CATEGORY_MAX,
    "Category",
  )
  if (title === undefined && category === undefined) return null
  return tx.catalogGalleryImage.upsert({
    where: {
      tenantId_contentDigest: {
        tenantId: input.tenantId,
        contentDigest: input.contentDigest,
      },
    },
    create: {
      tenantId: input.tenantId,
      contentDigest: input.contentDigest,
      title: title ?? null,
      category: category ?? null,
      updatedByUserId: input.actorUserId,
    },
    update: {
      ...(title === undefined ? {} : { title }),
      ...(category === undefined ? {} : { category }),
      updatedByUserId: input.actorUserId,
    },
    select: { title: true, category: true },
  })
}

/**
 * Title and category for an image in My images. Details belong to the exact
 * bytes in this business, so every copy (on any Item or Store) shares them.
 * Omitted fields stay as they are; blank clears.
 */
export async function updateCatalogGalleryDetails(
  db: PrismaClient,
  input: CatalogPhotoActorScope & {
    assetId: string
    title?: string | null
    category?: string | null
  },
) {
  return db.$transaction(async (tx) => {
    const asset = await findVisibleGalleryAsset(tx, input)
    const details = await writeGalleryDetails(tx, {
      ...input,
      contentDigest: asset.contentDigest,
    })
    return {
      assetId: asset.id,
      title: details?.title ?? null,
      category: details?.category ?? null,
    }
  }, transactionOptions)
}

/**
 * Keeps the actor's own finished upload in My images without an Item. The
 * upload must already have passed the byte check; its image review continues
 * as usual and other managers see it only once approved. A gallery-only
 * upload never attaches to an Item: reuse copies it like any other image.
 */
export async function addCatalogPhotoToGallery(
  db: PrismaClient,
  input: CatalogPhotoActorScope & {
    assetId: string
    title?: string | null
    category?: string | null
  },
) {
  return db.$transaction(async (tx) => {
    await authorizeCatalogPhotoScope(tx, input)
    const [asset] = await tx.$queryRaw<
      Array<{
        id: string
        state: string
        contentDigest: string
        catalogItemId: string | null
        storagePath: string | null
        uploadedAt: Date | null
        bytesDeletedAt: Date | null
        galleryAddedAt: Date | null
        expiresAt: Date
      }>
    >(Prisma.sql`
      SELECT * FROM "CatalogPhotoAsset" WHERE "id"=${input.assetId} AND "tenantId"=${input.tenantId}
      AND "storeId"=${input.storeId} AND "actorUserId"=${input.actorUserId} FOR UPDATE
    `)
    if (!asset)
      throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
    if (
      (asset.state !== "PENDING_REVIEW" && asset.state !== "APPROVED") ||
      !asset.storagePath ||
      !asset.uploadedAt ||
      asset.bytesDeletedAt ||
      asset.catalogItemId ||
      (!asset.galleryAddedAt && asset.expiresAt <= new Date())
    )
      throw new CatalogPhotoError(
        "PHOTO_NOT_READY",
        "Finish the photo upload before adding it to My images.",
      )
    const galleryAddedAt = asset.galleryAddedAt ?? new Date()
    await tx.catalogPhotoAsset.update({
      where: { id: asset.id },
      // Kept images leave the 24-hour draft expiry; removal restores it.
      data: { galleryAddedAt, expiresAt: CATALOG_GALLERY_KEEP_UNTIL },
    })
    const details = await writeGalleryDetails(tx, {
      ...input,
      contentDigest: asset.contentDigest,
    })
    return {
      assetId: asset.id,
      state: asset.state as "PENDING_REVIEW" | "APPROVED",
      galleryAddedAt,
      title: details?.title ?? null,
      category: details?.category ?? null,
    }
  }, transactionOptions)
}

/**
 * Source for copying a photo onto another Item. Only an approved photo that is
 * currently attached, or kept in My images, in a Store the actor manages
 * qualifies; the copy gets its own asset, bytes and review so detaching it
 * never affects the source.
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
      OR: [{ catalogItemId: { not: null } }, { galleryAddedAt: { not: null } }],
      bytesDeletedAt: null,
      contentDigest: target.photo.contentDigest,
      storagePath: target.photo.storagePath,
    },
    select: { id: true, reviewDisplayDigest: true, reviewPolicyVersion: true },
  })
  if (!asset)
    throw new CatalogPhotoError(
      "PHOTO_NOT_READY",
      "This image is no longer available to reuse. Choose another one.",
    )
  return {
    ...target,
    /** The approved verdict a byte-identical copy may carry over. */
    review:
      asset.reviewDisplayDigest && asset.reviewPolicyVersion
        ? {
            displayDigest: asset.reviewDisplayDigest,
            policyVersion: asset.reviewPolicyVersion,
          }
        : null,
  }
}
