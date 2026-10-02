import { randomUUID } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { financeDocumentCommand } from "./commands"
import {
  assetInScope,
  audit,
  authorize,
  metadata,
} from "./expense-receipt-access"
import {
  EXPENSE_RECEIPT_ATTACHED_LIMIT,
  EXPENSE_RECEIPT_OPEN_LIMIT,
  expenseReceiptUploadClaim,
  expenseReceiptVerifiedCompletion,
} from "./expense-receipt-metadata-rules"
import {
  FINANCE_EXPENSE_RECEIPT_INTENT_MS,
  type FinanceExpenseReceiptContentType,
  type FinanceExpenseReceiptScope,
  type FinanceExpenseReceiptStored,
  assertFinanceExpenseReceiptStored,
  financeExpenseReceiptFileName,
  financeExpenseReceiptIntentHash,
  financeExpenseReceiptStoragePath,
} from "./expense-receipt-rules"
import { FinanceError } from "./rules"

type Tx = Prisma.TransactionClient
type Scope = FinanceExpenseReceiptScope
export type CreateFinanceExpenseReceiptInput = Scope & {
  clientCommandId: string
  originalFileName: string
  contentDigest: string
  contentType: FinanceExpenseReceiptContentType
  sizeBytes: number
}

export async function createFinanceExpenseReceiptInTransaction(
  tx: Tx,
  input: CreateFinanceExpenseReceiptInput,
) {
  const payloadHash = financeExpenseReceiptIntentHash(input)
  const originalFileName = financeExpenseReceiptFileName(input.originalFileName)
  // READ authorizes an existing command replay even if the Expense was voided.
  const { expense } = await authorize(tx, input, "READ")
  const result = await financeDocumentCommand(
    tx,
    input,
    "EXPENSE_RECEIPT_INTENT",
    { payloadHash },
    async () => {
      if (expense.voidedAt)
        throw new FinanceError(
          "CONFLICT",
          "Cancelled expenses cannot add receipts.",
        )
      const now = new Date()
      const open = await tx.financeExpenseReceiptAsset.count({
        where: {
          tenantId: input.tenantId,
          bookId: input.bookId,
          actorUserId: input.actorUserId,
          attachedAt: null,
          bytesDeletedAt: null,
          expiresAt: { gt: now },
        },
      })
      const attached = await tx.financeExpenseReceiptAsset.count({
        where: {
          tenantId: input.tenantId,
          bookId: input.bookId,
          billId: input.billId,
          attachedAt: { not: null },
        },
      })
      if (
        open >= EXPENSE_RECEIPT_OPEN_LIMIT ||
        attached >= EXPENSE_RECEIPT_ATTACHED_LIMIT
      ) {
        throw new FinanceError(
          "CONFLICT",
          "The receipt limit has been reached.",
        )
      }
      const id = randomUUID()
      const asset = await tx.financeExpenseReceiptAsset.create({
        data: {
          id,
          tenantId: input.tenantId,
          bookId: input.bookId,
          billId: input.billId,
          actorUserId: input.actorUserId,
          clientCommandId: input.clientCommandId,
          payloadHash,
          originalFileName,
          contentDigest: input.contentDigest,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          storagePath: financeExpenseReceiptStoragePath({
            ...input,
            assetId: id,
          }),
          createdAt: now,
          expiresAt: new Date(
            now.getTime() + FINANCE_EXPENSE_RECEIPT_INTENT_MS,
          ),
        },
      })
      await audit(tx, asset, input.actorUserId, "INTENT_CREATED", now)
      return { id }
    },
  )
  const asset = await assetInScope(tx, input, result.id)
  if (
    asset.actorUserId !== input.actorUserId ||
    asset.clientCommandId !== input.clientCommandId ||
    asset.payloadHash !== payloadHash
  ) {
    throw new FinanceError(
      "CONFLICT",
      "The saved receipt command cannot be recovered.",
    )
  }
  return metadata(asset)
}

export async function getFinanceExpenseReceiptInTransaction(
  tx: Tx,
  input: Scope & { assetId: string },
) {
  await authorize(tx, input, "READ")
  return metadata(await assetInScope(tx, input, input.assetId))
}

export async function listFinanceExpenseReceiptsInTransaction(
  tx: Tx,
  input: Scope & { limit?: number; cursor?: string },
) {
  await authorize(tx, input, "READ")
  const limit = input.limit ?? 25
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new FinanceError("INVALID_JOURNAL", "Invalid receipt page size.")
  if (input.cursor) await assetInScope(tx, input, input.cursor)
  const assets = await tx.financeExpenseReceiptAsset.findMany({
    where: {
      tenantId: input.tenantId,
      bookId: input.bookId,
      billId: input.billId,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  })
  const page = assets.slice(0, limit)
  return {
    items: page.map(metadata),
    nextCursor: assets.length > limit ? (page.at(-1)?.id ?? null) : null,
  }
}

/** Internal upload reservation. Server configuration supplies the pin; no public route accepts it. */
export async function claimFinanceExpenseReceiptUploadInTransaction(
  tx: Tx,
  input: Scope & { assetId: string; storageStoreId: string },
) {
  const { tenant } = await authorize(tx, input, "CREATE_INTENT")
  const asset = await assetInScope(tx, input, input.assetId)
  const now = new Date()
  const claim = expenseReceiptUploadClaim(
    asset,
    input.actorUserId,
    input.storageStoreId,
    now,
  )
  const claimId = randomUUID()
  const updated = await tx.financeExpenseReceiptAsset.update({
    where: { id: asset.id },
    data: {
      uploadState: "CLAIMED",
      uploadClaimId: claimId,
      uploadClaimedAt: now,
      uploadLeaseUntil: claim.uploadLeaseUntil,
      version: claim.version,
      storageStoreId: input.storageStoreId,
    },
  })
  await audit(tx, updated, input.actorUserId, "UPLOAD_CLAIMED", now)
  // Internal facts only. Never return these from merchant metadata endpoints.
  return {
    scope: {
      tenantId: asset.tenantId,
      bookId: asset.bookId,
      billId: asset.billId,
      actorUserId: asset.actorUserId,
      dataClassification: tenant.dataClassification,
    },
    target: {
      tenantId: asset.tenantId,
      bookId: asset.bookId,
      billId: asset.billId,
      assetId: asset.id,
      actorUserId: asset.actorUserId,
      contentDigest: asset.contentDigest,
      contentType: asset.contentType as FinanceExpenseReceiptContentType,
      sizeBytes: asset.sizeBytes,
      createdAt: asset.createdAt,
      expiresAt: asset.expiresAt,
    },
    claimId,
    claimVersion: updated.version,
    leaseUntil: claim.uploadLeaseUntil,
    storageStoreId: input.storageStoreId,
  }
}

/** Only a trusted original-read adapter may supply stored. This never approves safety or attachment. */
export async function recordFinanceExpenseReceiptVerifiedInTransaction(
  tx: Tx,
  input: Scope & {
    assetId: string
    claimId: string
    claimVersion: number
    stored: FinanceExpenseReceiptStored & {
      storageStoreId: string
      state: "QUARANTINED"
    }
  },
) {
  const { expense } = await authorize(tx, input, "READ")
  const asset = await assetInScope(tx, input, input.assetId)
  const now = new Date()
  if (
    input.stored.state !== "QUARANTINED" ||
    input.stored.storagePath !== asset.storagePath ||
    input.stored.storageProvider !== asset.storageProvider
  )
    throw new FinanceError(
      "CONFLICT",
      "Original receipt verification is required.",
    )
  assertFinanceExpenseReceiptStored(
    {
      ...asset,
      assetId: asset.id,
      contentType: asset.contentType as FinanceExpenseReceiptContentType,
    },
    input.stored,
  )
  const completion = expenseReceiptVerifiedCompletion(
    asset,
    {
      actorUserId: input.actorUserId,
      claimId: input.claimId,
      claimVersion: input.claimVersion,
      storeId: input.stored.storageStoreId,
      verifiedAt: input.stored.verifiedAt,
    },
    now,
  )
  if (completion.replay) return metadata(asset)
  if (expense.voidedAt)
    throw new FinanceError(
      "CONFLICT",
      "Cancelled expenses cannot complete receipt uploads.",
    )
  const updated = await tx.financeExpenseReceiptAsset.update({
    where: { id: asset.id },
    data: {
      uploadState: "VERIFIED",
      version: asset.version + 1,
      verifiedAt: input.stored.verifiedAt,
      verifiedClaimId: input.claimId,
      verifiedClaimVersion: input.claimVersion,
      uploadClaimId: null,
      uploadLeaseUntil: null,
    },
  })
  await audit(tx, updated, input.actorUserId, "UPLOAD_VERIFIED", now)
  return metadata(updated)
}
