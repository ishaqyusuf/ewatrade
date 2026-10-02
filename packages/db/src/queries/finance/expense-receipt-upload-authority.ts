import type {
  FinanceExpenseReceiptAsset,
  Prisma,
  QaDataClassification,
} from "../../../generated/prisma/client"
import { assetInScope, authorize, metadata } from "./expense-receipt-access"
import { expenseReceiptPinnedStoreId } from "./expense-receipt-metadata-rules"
import {
  type FinanceExpenseReceiptContentType,
  type FinanceExpenseReceiptScope,
  type FinanceExpenseReceiptStored,
  assertFinanceExpenseReceiptStored,
  financeExpenseReceiptFileName,
  financeExpenseReceiptIntentHash,
  financeExpenseReceiptStoragePath,
} from "./expense-receipt-rules"
import type { claimFinanceExpenseReceiptUploadInTransaction } from "./expense-receipts"
import { FinanceError } from "./rules"

type Tx = Prisma.TransactionClient
type Scope = FinanceExpenseReceiptScope
type Claim = Awaited<
  ReturnType<typeof claimFinanceExpenseReceiptUploadInTransaction>
>

export type FinanceExpenseReceiptUploadFacts = {
  scope: Scope & { dataClassification: QaDataClassification }
  target: Claim["target"]
}

export type FinanceExpenseReceiptActiveClaim = Claim

type UploadTarget = Claim["target"]

function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Receipt upload authority is no longer valid.",
  )
}

function safeDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime())
}

function sameDate(a: Date, b: Date) {
  return safeDate(a) && safeDate(b) && a.getTime() === b.getTime()
}

function currentScope(scope: Scope, classification: QaDataClassification) {
  if (classification !== "QA" && classification !== "LIVE") conflict()
  return { ...scope, dataClassification: classification }
}

function persistedTarget(asset: FinanceExpenseReceiptAsset): UploadTarget {
  return {
    tenantId: asset.tenantId,
    bookId: asset.bookId,
    billId: asset.billId,
    assetId: asset.id,
    actorUserId: asset.actorUserId,
    contentDigest: asset.contentDigest,
    contentType: asset.contentType as FinanceExpenseReceiptContentType,
    sizeBytes: asset.sizeBytes,
    createdAt: new Date(asset.createdAt),
    expiresAt: new Date(asset.expiresAt),
  }
}

function immutableIntent(asset: FinanceExpenseReceiptAsset, now: Date) {
  if (
    asset.actorUserId.length < 1 ||
    asset.originalFileName !==
      financeExpenseReceiptFileName(asset.originalFileName) ||
    !safeDate(asset.createdAt) ||
    !safeDate(asset.expiresAt) ||
    asset.createdAt.getTime() > now.getTime() ||
    asset.expiresAt.getTime() <= asset.createdAt.getTime()
  )
    conflict()

  const payloadHash = financeExpenseReceiptIntentHash({
    tenantId: asset.tenantId,
    bookId: asset.bookId,
    billId: asset.billId,
    actorUserId: asset.actorUserId,
    clientCommandId: asset.clientCommandId,
    originalFileName: asset.originalFileName,
    contentDigest: asset.contentDigest,
    contentType: asset.contentType as FinanceExpenseReceiptContentType,
    sizeBytes: asset.sizeBytes,
  })
  if (payloadHash !== asset.payloadHash) conflict()

  const assetId = asset.id
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(assetId)) conflict()
  const intent = {
    ...asset,
    assetId,
    contentType: asset.contentType as FinanceExpenseReceiptContentType,
  }
  if (
    asset.storageProvider !== "vercel_blob_private" ||
    asset.storagePath !==
      financeExpenseReceiptStoragePath({
        tenantId: asset.tenantId,
        bookId: asset.bookId,
        billId: asset.billId,
        assetId,
        contentDigest: asset.contentDigest,
        contentType: asset.contentType as FinanceExpenseReceiptContentType,
      })
  )
    conflict()

  return intent
}

function storedOriginal(asset: FinanceExpenseReceiptAsset, now: Date) {
  const intent = immutableIntent(asset, now)
  if (
    asset.storageStoreId === null ||
    asset.verifiedAt === null ||
    !safeDate(asset.verifiedAt) ||
    asset.verifiedAt.getTime() < asset.createdAt.getTime() ||
    asset.verifiedAt.getTime() >= asset.expiresAt.getTime() ||
    asset.verifiedAt.getTime() > now.getTime()
  )
    conflict()
  expenseReceiptPinnedStoreId(asset.storageStoreId)
  const stored: FinanceExpenseReceiptStored = {
    tenantId: asset.tenantId,
    bookId: asset.bookId,
    billId: asset.billId,
    assetId: asset.id,
    contentDigest: asset.contentDigest,
    contentType: asset.contentType as FinanceExpenseReceiptContentType,
    sizeBytes: asset.sizeBytes,
    storageProvider: "vercel_blob_private",
    storagePath: asset.storagePath,
    verifiedAt: new Date(asset.verifiedAt),
  }
  assertFinanceExpenseReceiptStored(intent, stored)
  return { intent, stored }
}

function assertNoAttachedHistory(asset: FinanceExpenseReceiptAsset) {
  if (
    asset.attachmentState !== "UNATTACHED" ||
    asset.attachedAt !== null ||
    asset.attachedById !== null ||
    asset.withdrawnAt !== null ||
    asset.withdrawnById !== null
  )
    conflict()
}

function assertCompletedAttachmentFacts(asset: FinanceExpenseReceiptAsset) {
  if (asset.attachmentState === "UNATTACHED") {
    assertNoAttachedHistory(asset)
  } else if (asset.attachmentState === "ATTACHED") {
    if (
      !safeDate(asset.attachedAt) ||
      asset.attachedById === null ||
      asset.attachedAt.getTime() < (asset.verifiedAt?.getTime() ?? 0) ||
      asset.withdrawnAt !== null ||
      asset.withdrawnById !== null
    )
      conflict()
  } else if (asset.attachmentState === "WITHDRAWN") {
    if (
      !safeDate(asset.attachedAt) ||
      asset.attachedById === null ||
      !safeDate(asset.withdrawnAt) ||
      asset.withdrawnById === null ||
      asset.attachedAt.getTime() < (asset.verifiedAt?.getTime() ?? 0) ||
      asset.withdrawnAt.getTime() < asset.attachedAt.getTime()
    )
      conflict()
  } else conflict()
}

function assertNoDeletionOrCleanup(asset: FinanceExpenseReceiptAsset) {
  if (
    asset.bytesDeletedAt !== null ||
    asset.cleanupClaimId !== null ||
    asset.cleanupLeaseUntil !== null
  )
    conflict()
}

function assertPendingOriginal(asset: FinanceExpenseReceiptAsset, now: Date) {
  immutableIntent(asset, now)
  if (
    (asset.uploadState !== "PENDING" &&
      asset.uploadState !== "CLAIMED" &&
      asset.uploadState !== "RETRYABLE") ||
    asset.safetyState !== "QUARANTINED" ||
    asset.safetyAttestation !== null ||
    asset.safetyReviewedAt !== null ||
    asset.verifiedAt !== null ||
    asset.verifiedClaimId !== null ||
    asset.verifiedClaimVersion !== null ||
    !Number.isSafeInteger(asset.version) ||
    asset.version < 0 ||
    !safeDate(asset.expiresAt) ||
    asset.expiresAt.getTime() <= now.getTime()
  )
    conflict()
  assertNoAttachedHistory(asset)
  assertNoDeletionOrCleanup(asset)
}

async function verifyClaimAudit(
  tx: Tx,
  asset: FinanceExpenseReceiptAsset,
  actorUserId: string,
  claimVersion: number,
  after: Date,
  before: Date,
) {
  const event = await tx.financeExpenseReceiptAuditEvent.findFirst({
    where: {
      tenantId: asset.tenantId,
      bookId: asset.bookId,
      billId: asset.billId,
      assetId: asset.id,
      actorUserId,
      kind: "UPLOAD_CLAIMED",
      assetVersion: claimVersion,
      occurredAt: { gte: after, lte: before },
    },
    select: { id: true },
  })
  if (!event) conflict()
}

async function verifyCompletionAudit(
  tx: Tx,
  asset: FinanceExpenseReceiptAsset,
  actorUserId: string,
  claimVersion: number,
  verifiedAt: Date,
  now: Date,
) {
  const event = await tx.financeExpenseReceiptAuditEvent.findFirst({
    where: {
      tenantId: asset.tenantId,
      bookId: asset.bookId,
      billId: asset.billId,
      assetId: asset.id,
      actorUserId,
      kind: "UPLOAD_VERIFIED",
      assetVersion: claimVersion + 1,
      occurredAt: { gte: verifiedAt, lte: now },
    },
    select: { id: true },
  })
  if (!event) conflict()
}

function pendingMetadata(asset: FinanceExpenseReceiptAsset) {
  if (
    asset.uploadClaimId !== null ||
    asset.uploadClaimedAt !== null ||
    asset.uploadLeaseUntil !== null ||
    asset.storageStoreId !== null
  )
    conflict()
}

function validateActiveClaim(
  asset: FinanceExpenseReceiptAsset,
  claim: Claim,
  target: UploadTarget,
  now: Date,
) {
  const claimAt = asset.uploadClaimedAt
  const leaseUntil = asset.uploadLeaseUntil
  if (
    asset.uploadState !== "CLAIMED" ||
    asset.safetyState !== "QUARANTINED" ||
    asset.version < 1 ||
    asset.version !== claim.claimVersion ||
    claim.claimVersion < 1 ||
    typeof claim.claimId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(claim.claimId) ||
    claim.claimId !== asset.uploadClaimId ||
    !safeDate(claimAt) ||
    !safeDate(leaseUntil) ||
    !sameDate(claim.leaseUntil, leaseUntil) ||
    leaseUntil.getTime() <= now.getTime() ||
    leaseUntil.getTime() <= claimAt.getTime() ||
    leaseUntil.getTime() - claimAt.getTime() > 180_000 ||
    asset.expiresAt.getTime() <= now.getTime() ||
    leaseUntil.getTime() > asset.expiresAt.getTime() ||
    claimAt.getTime() < asset.createdAt.getTime() ||
    claimAt.getTime() > now.getTime() ||
    typeof claim.storageStoreId !== "string" ||
    !asset.storageStoreId ||
    claim.storageStoreId !== asset.storageStoreId
  )
    conflict()
  expenseReceiptPinnedStoreId(asset.storageStoreId)
  const fields: Array<keyof UploadTarget> = [
    "tenantId",
    "bookId",
    "billId",
    "assetId",
    "actorUserId",
    "contentDigest",
    "contentType",
    "sizeBytes",
  ]
  for (const field of fields) {
    if (claim.target[field] !== target[field]) conflict()
  }
  if (
    !sameDate(claim.target.createdAt, target.createdAt) ||
    !sameDate(claim.target.expiresAt, target.expiresAt) ||
    claim.scope.tenantId !== target.tenantId ||
    claim.scope.bookId !== target.bookId ||
    claim.scope.billId !== target.billId ||
    claim.scope.actorUserId !== asset.actorUserId
  )
    conflict()
}

/** Current creator-owned receipt facts; verified completion retries never renew or reverse state. */
export async function getFinanceExpenseReceiptUploadAuthorityInTransaction(
  tx: Tx,
  input: Scope & { assetId: string },
) {
  const { tenant, expense } = await authorize(tx, input, "READ")
  const asset = await assetInScope(tx, input, input.assetId)
  if (asset.actorUserId !== input.actorUserId) {
    throw new FinanceError(
      "FORBIDDEN",
      "Only the receipt creator can upload it.",
    )
  }
  const now = new Date()
  const target = persistedTarget(asset)
  const scope = currentScope(input, tenant.dataClassification)

  if (asset.uploadState === "VERIFIED") {
    const { stored } = storedOriginal(asset, now)
    const storageStoreId = asset.storageStoreId
    if (storageStoreId === null) conflict()
    const storedWithPin = {
      ...stored,
      storageStoreId: expenseReceiptPinnedStoreId(storageStoreId),
    }
    assertNoDeletionOrCleanup(asset)
    if (
      asset.safetyState !== "QUARANTINED" &&
      asset.safetyState !== "SAFE" &&
      asset.safetyState !== "REJECTED"
    )
      conflict()
    if (
      !asset.verifiedClaimId ||
      !Number.isSafeInteger(asset.verifiedClaimVersion) ||
      asset.verifiedClaimVersion === null ||
      asset.verifiedClaimVersion < 1 ||
      asset.uploadClaimedAt === null ||
      !safeDate(asset.uploadClaimedAt) ||
      asset.uploadClaimedAt.getTime() < asset.createdAt.getTime() ||
      asset.uploadClaimedAt.getTime() > stored.verifiedAt.getTime() ||
      asset.uploadClaimId !== null ||
      asset.uploadLeaseUntil !== null
    )
      conflict()
    assertCompletedAttachmentFacts(asset)
    await verifyClaimAudit(
      tx,
      asset,
      asset.actorUserId,
      asset.verifiedClaimVersion,
      asset.uploadClaimedAt,
      stored.verifiedAt,
    )
    await verifyCompletionAudit(
      tx,
      asset,
      asset.actorUserId,
      asset.verifiedClaimVersion,
      stored.verifiedAt,
      now,
    )
    const metadataSnapshot = metadata(asset)
    return {
      kind: "VERIFIED" as const,
      scope,
      target: structuredClone(target),
      // The pin is internal provenance for exact retry comparisons only; it is
      // never included in the merchant metadata DTO.
      stored: structuredClone(storedWithPin),
      metadata: structuredClone(metadataSnapshot),
    }
  }

  if (
    asset.uploadState !== "PENDING" &&
    asset.uploadState !== "CLAIMED" &&
    asset.uploadState !== "RETRYABLE"
  )
    conflict()
  if (expense.voidedAt !== null) conflict()
  if (
    asset.uploadClaimId !== null ||
    asset.uploadClaimedAt !== null ||
    asset.uploadLeaseUntil !== null ||
    asset.storageStoreId !== null
  ) {
    if (asset.uploadState !== "CLAIMED") conflict()
  }
  if (asset.uploadState === "PENDING" || asset.uploadState === "RETRYABLE")
    pendingMetadata(asset)
  assertPendingOriginal(asset, now)
  if (
    tenant.dataClassification !== "QA" &&
    tenant.dataClassification !== "LIVE"
  )
    conflict()
  const dto = structuredClone(metadata(asset))
  if (asset.uploadState === "CLAIMED") {
    const claimId = asset.uploadClaimId
    const claimedAt = asset.uploadClaimedAt
    const leaseUntil = asset.uploadLeaseUntil
    const storeId = asset.storageStoreId
    if (
      claimId === null ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(claimId) ||
      claimedAt === null ||
      leaseUntil === null ||
      storeId === null ||
      !safeDate(claimedAt) ||
      !safeDate(leaseUntil)
    )
      conflict()
    const claimVersion = asset.version
    if (
      !Number.isSafeInteger(claimVersion) ||
      claimVersion < 1 ||
      claimedAt.getTime() < asset.createdAt.getTime() ||
      claimedAt.getTime() > now.getTime() ||
      leaseUntil.getTime() <= claimedAt.getTime() ||
      leaseUntil.getTime() - claimedAt.getTime() > 180_000 ||
      leaseUntil.getTime() > asset.expiresAt.getTime()
    )
      conflict()
    expenseReceiptPinnedStoreId(storeId)
    await verifyClaimAudit(
      tx,
      asset,
      asset.actorUserId,
      claimVersion,
      claimedAt,
      leaseUntil.getTime() > now.getTime() ? now : leaseUntil,
    )
    if (leaseUntil.getTime() <= now.getTime()) {
      return {
        kind: "READY" as const,
        scope,
        target: structuredClone(target),
        storageStoreId: storeId,
        metadata: dto,
      }
    }
    // The held claim belongs to its original request; a duplicate request must
    // not receive the private storage authority.
    conflict()
  }
  return {
    kind: "READY" as const,
    scope,
    target: structuredClone(target),
    metadata: dto,
  }
}

/** Re-read and validate this exact held claim immediately before each provider put/get. */
export async function revalidateFinanceExpenseReceiptUploadClaimInTransaction(
  tx: Tx,
  claimInput: Claim,
) {
  // Clone before the first await: callers may hold/mutate their prior result while
  // this fresh transaction checks current database state.
  const claim: Claim = structuredClone(claimInput)
  const input: Scope & { assetId: string } = {
    tenantId: claim.scope.tenantId,
    actorUserId: claim.scope.actorUserId,
    bookId: claim.scope.bookId,
    billId: claim.scope.billId,
    assetId: claim.target.assetId,
  }
  const { tenant, expense } = await authorize(tx, input, "READ")
  const asset = await assetInScope(tx, input, input.assetId)
  if (asset.actorUserId !== input.actorUserId) {
    throw new FinanceError(
      "FORBIDDEN",
      "Only the receipt creator can upload it.",
    )
  }
  const now = new Date()
  assertPendingOriginal(asset, now)
  if (expense.voidedAt !== null) conflict()
  const target = persistedTarget(asset)
  validateActiveClaim(asset, claim, target, now)
  const claimedAt = asset.uploadClaimedAt
  const leaseUntil = asset.uploadLeaseUntil
  const claimId = asset.uploadClaimId
  const storeId = asset.storageStoreId
  if (
    claimedAt === null ||
    leaseUntil === null ||
    claimId === null ||
    storeId === null ||
    !safeDate(claimedAt) ||
    !safeDate(leaseUntil)
  )
    conflict()
  await verifyClaimAudit(
    tx,
    asset,
    asset.actorUserId,
    asset.version,
    claimedAt,
    leaseUntil.getTime() > now.getTime() ? now : leaseUntil,
  )
  return {
    scope: currentScope(input, tenant.dataClassification),
    target: structuredClone(target),
    claimId,
    claimVersion: asset.version,
    claimedAt: new Date(claimedAt),
    leaseUntil: new Date(leaseUntil),
    storageStoreId: expenseReceiptPinnedStoreId(storeId),
  }
}
