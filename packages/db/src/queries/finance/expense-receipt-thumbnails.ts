import type { Prisma } from "../../../generated/prisma/client"
import {
  type FinanceExpenseReceiptDeliveryAuthority,
  getFinanceExpenseReceiptDeliveryAuthorityInTransaction,
} from "./expense-receipt-delivery-authority"
import type { FinanceExpenseReceiptScope } from "./expense-receipt-rules"
import { FinanceError } from "./rules"

type Tx = Prisma.TransactionClient

export type FinanceExpenseReceiptThumbnail = {
  storagePath: string
  contentDigest: string
  sizeBytes: number
  width: number
  height: number
  version: string
}

export type FinanceExpenseReceiptThumbnailAuthority =
  FinanceExpenseReceiptDeliveryAuthority & {
    thumbnail: FinanceExpenseReceiptThumbnail | null
  }

const thumbnailSelect = {
  thumbnailPath: true,
  thumbnailDigest: true,
  thumbnailSizeBytes: true,
  thumbnailWidth: true,
  thumbnailHeight: true,
  thumbnailVersion: true,
} satisfies Prisma.FinanceExpenseReceiptAssetSelect

function storedThumbnail(row: {
  thumbnailPath: string | null
  thumbnailDigest: string | null
  thumbnailSizeBytes: number | null
  thumbnailWidth: number | null
  thumbnailHeight: number | null
  thumbnailVersion: string | null
}): FinanceExpenseReceiptThumbnail | null {
  if (
    !row.thumbnailPath ||
    !row.thumbnailDigest ||
    !row.thumbnailVersion ||
    row.thumbnailSizeBytes === null ||
    row.thumbnailWidth === null ||
    row.thumbnailHeight === null
  )
    return null
  return {
    storagePath: row.thumbnailPath,
    contentDigest: row.thumbnailDigest,
    sizeBytes: row.thumbnailSizeBytes,
    width: row.thumbnailWidth,
    height: row.thumbnailHeight,
    version: row.thumbnailVersion,
  }
}

/**
 * Current Owner/Admin authority over an attached SAFE receipt (the same check as
 * original delivery) plus its recorded thumbnail, if any. No grant is involved.
 */
export async function getFinanceExpenseReceiptThumbnailAuthorityInTransaction(
  tx: Tx,
  input: FinanceExpenseReceiptScope & { assetId: string },
): Promise<FinanceExpenseReceiptThumbnailAuthority> {
  const authority =
    await getFinanceExpenseReceiptDeliveryAuthorityInTransaction(tx, input)
  const row = await tx.financeExpenseReceiptAsset.findFirst({
    where: {
      id: input.assetId,
      tenantId: input.tenantId,
      bookId: input.bookId,
      billId: input.billId,
    },
    select: thumbnailSelect,
  })
  if (!row)
    throw new FinanceError("FORBIDDEN", "Receipt preview is unavailable.")
  return { ...authority, thumbnail: storedThumbnail(row) }
}

/**
 * Record a verified thumbnail only while the receipt is still attached, SAFE and
 * has the same original. An existing thumbnail wins, so concurrent makers agree.
 */
export async function recordFinanceExpenseReceiptThumbnailInTransaction(
  tx: Tx,
  input: FinanceExpenseReceiptScope & {
    assetId: string
    originalDigest: string
    thumbnail: FinanceExpenseReceiptThumbnail
  },
): Promise<FinanceExpenseReceiptThumbnail> {
  const authority =
    await getFinanceExpenseReceiptDeliveryAuthorityInTransaction(tx, input)
  if (authority.original.contentDigest !== input.originalDigest)
    throw new FinanceError("CONFLICT", "The original receipt has changed.")
  await tx.$queryRaw`
    SELECT id FROM "FinanceExpenseReceiptAsset"
    WHERE id = ${input.assetId} AND "tenantId" = ${input.tenantId}
      AND "bookId" = ${input.bookId} AND "billId" = ${input.billId}
    FOR UPDATE`
  await tx.financeExpenseReceiptAsset.updateMany({
    where: {
      id: input.assetId,
      tenantId: input.tenantId,
      bookId: input.bookId,
      billId: input.billId,
      contentDigest: input.originalDigest,
      attachmentState: "ATTACHED",
      safetyState: "SAFE",
      withdrawnAt: null,
      bytesDeletedAt: null,
      thumbnailPath: null,
    },
    data: {
      thumbnailPath: input.thumbnail.storagePath,
      thumbnailDigest: input.thumbnail.contentDigest,
      thumbnailSizeBytes: input.thumbnail.sizeBytes,
      thumbnailWidth: input.thumbnail.width,
      thumbnailHeight: input.thumbnail.height,
      thumbnailVersion: input.thumbnail.version,
      thumbnailCreatedAt: new Date(),
    },
  })
  const row = await tx.financeExpenseReceiptAsset.findFirst({
    where: {
      id: input.assetId,
      tenantId: input.tenantId,
      bookId: input.bookId,
      billId: input.billId,
    },
    select: thumbnailSelect,
  })
  const saved = row ? storedThumbnail(row) : null
  if (!saved)
    throw new FinanceError("FORBIDDEN", "Receipt preview is unavailable.")
  return saved
}
