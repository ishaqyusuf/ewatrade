import {
  CATALOG_PHOTO_PROCESSING_VERSION,
  processCatalogPhoto,
} from "@ewatrade/catalog/photo-processing"
import {
  type ExpenseReceiptThumbnailRepository,
  FinanceError,
} from "@ewatrade/db/finance-expense-receipt-delivery"
import {
  type ExpenseReceiptThumbnailObject,
  createExpenseReceiptStorage,
  createExpenseReceiptThumbnailStorage,
  expenseReceiptThumbnailPath,
} from "@ewatrade/private-media/expense-receipts"
import { ExpenseReceiptDeliveryError } from "./expense-receipt-delivery-workflow"
import type { ExpenseReceiptUploadStorage } from "./expense-receipt-upload-workflow"

/** Images that get a thumbnail; PDFs show an icon instead (ADR-0051). */
const THUMBNAIL_SOURCES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const
type ThumbnailSource = (typeof THUMBNAIL_SOURCES)[number]

export type ExpenseReceiptThumbnailContext = {
  repository: ExpenseReceiptThumbnailRepository
  // Production reloads current protected context and the persisted live session.
  checkSession: () => Promise<void>
  storage: () => ExpenseReceiptUploadStorage
  signal: AbortSignal
}

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw new ExpenseReceiptDeliveryError(408)
}

async function currentSession(input: ExpenseReceiptThumbnailContext) {
  aborted(input.signal)
  await input.checkSession()
  aborted(input.signal)
}

function thumbnailSource(contentType: string): ThumbnailSource {
  const source = THUMBNAIL_SOURCES.find((type) => type === contentType)
  if (!source)
    throw new FinanceError("NOT_FOUND", "This receipt has no preview.")
  return source
}

type Authority = Awaited<
  ReturnType<ExpenseReceiptThumbnailRepository["inspect"]>
>

function thumbnailObject(
  authority: Authority,
  thumbnail: { storagePath: string; contentDigest: string; sizeBytes: number },
): ExpenseReceiptThumbnailObject {
  return {
    tenantId: authority.scope.tenantId,
    bookId: authority.scope.bookId,
    billId: authority.scope.billId,
    assetId: authority.original.assetId,
    contentType: "image/webp",
    contentDigest: thumbnail.contentDigest,
    sizeBytes: thumbnail.sizeBytes,
    storagePath: thumbnail.storagePath,
  }
}

/**
 * Make, verify and record the thumbnail for an attached SAFE image receipt if it
 * has none. Decoding and storage run outside transactions; the record is a
 * compare-and-set, so a concurrent maker's thumbnail wins.
 */
async function ensureThumbnail(
  input: ExpenseReceiptThumbnailContext,
  authority: Authority,
) {
  if (authority.thumbnail) return authority.thumbnail
  const contentType = thumbnailSource(authority.original.contentType)
  const configured = input.storage()
  if (configured.storeId !== authority.original.storageStoreId)
    throw new FinanceError("CONFLICT", "Original receipt storage has changed.")
  const original = await createExpenseReceiptStorage(
    configured,
  ).readQuarantinedOriginal({
    scope: authority.scope,
    object: { ...authority.original, state: "QUARANTINED" },
    abortSignal: input.signal,
  })
  aborted(input.signal)
  const { thumbnail } = await processCatalogPhoto({
    bytes: original,
    contentType,
    signal: input.signal,
  })
  const object = thumbnailObject(authority, {
    contentDigest: thumbnail.contentDigest,
    sizeBytes: thumbnail.sizeBytes,
    storagePath: expenseReceiptThumbnailPath({
      tenantId: authority.scope.tenantId,
      bookId: authority.scope.bookId,
      billId: authority.scope.billId,
      assetId: authority.original.assetId,
      contentDigest: thumbnail.contentDigest,
    }),
  })
  await createExpenseReceiptThumbnailStorage(configured).write({
    scope: authority.scope,
    object,
    bytes: thumbnail.bytes,
    abortSignal: input.signal,
  })
  await currentSession(input)
  return input.repository.record(authority.original.contentDigest, {
    storagePath: object.storagePath,
    contentDigest: object.contentDigest,
    sizeBytes: object.sizeBytes,
    width: thumbnail.width,
    height: thumbnail.height,
    version: CATALOG_PHOTO_PROCESSING_VERSION,
  })
}

/** Best effort after attaching: a failure never undoes the attachment. */
export async function makeFinanceExpenseReceiptThumbnail(
  input: ExpenseReceiptThumbnailContext,
) {
  try {
    await currentSession(input)
    const authority = await input.repository.inspect()
    if (
      !THUMBNAIL_SOURCES.some((type) => type === authority.original.contentType)
    )
      return
    await ensureThumbnail(input, authority)
  } catch {
    // The first authorized view retries; nothing is shown until it succeeds.
  }
}

/** Current Owner/Admin read of a receipt thumbnail, made on first view if needed. */
export async function readFinanceExpenseReceiptThumbnail(
  input: ExpenseReceiptThumbnailContext,
) {
  await currentSession(input)
  const authority = await input.repository.inspect()
  thumbnailSource(authority.original.contentType)
  const thumbnail = await ensureThumbnail(input, authority)
  const bytes = await createExpenseReceiptThumbnailStorage(
    input.storage(),
  ).read({
    scope: authority.scope,
    object: thumbnailObject(authority, thumbnail),
    abortSignal: input.signal,
  })
  // No bytes leave before a second current session and authority check.
  await currentSession(input)
  const fresh = await input.repository.inspect()
  if (
    fresh.original.contentDigest !== authority.original.contentDigest ||
    fresh.thumbnail?.storagePath !== thumbnail.storagePath
  )
    throw new FinanceError("CONFLICT", "Receipt preview has changed.")
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(authority.original.assetId))
    throw new FinanceError("CONFLICT", "Receipt preview has changed.")
  return {
    bytes,
    fileName: `receipt-${authority.original.assetId}-preview.webp`,
  }
}
