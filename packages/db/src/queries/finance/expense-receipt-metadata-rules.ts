import { FinanceError } from "./rules"

export const EXPENSE_RECEIPT_OPEN_LIMIT = 32
export const EXPENSE_RECEIPT_ATTACHED_LIMIT = 12
export const EXPENSE_RECEIPT_UPLOAD_LEASE_MS = 180_000

export type ExpenseReceiptUploadFacts = {
  actorUserId: string
  uploadState: string
  safetyState: string
  attachmentState: string
  version: number
  expiresAt: Date
  attachedAt: Date | null
  bytesDeletedAt: Date | null
  cleanupClaimId: string | null
  uploadClaimId: string | null
  uploadClaimedAt: Date | null
  uploadLeaseUntil: Date | null
  storageStoreId: string | null
  verifiedClaimId: string | null
  verifiedClaimVersion: number | null
  verifiedAt: Date | null
}

function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "This receipt upload is no longer available.",
  )
}

export function expenseReceiptPinnedStoreId(value: string) {
  if (!/^store_[a-zA-Z0-9]{1,120}$/.test(value)) conflict()
  return value
}

function time(now: Date) {
  const value = now.getTime()
  if (!Number.isFinite(value)) conflict()
  return value
}

function assertUnfinished(
  asset: ExpenseReceiptUploadFacts,
  actorUserId: string,
) {
  if (asset.actorUserId !== actorUserId) {
    throw new FinanceError(
      "FORBIDDEN",
      "Only the receipt creator can upload it.",
    )
  }
  if (
    asset.attachmentState !== "UNATTACHED" ||
    asset.safetyState !== "QUARANTINED" ||
    asset.attachedAt !== null ||
    asset.bytesDeletedAt !== null ||
    asset.cleanupClaimId !== null
  )
    conflict()
}

export function expenseReceiptUploadClaim(
  asset: ExpenseReceiptUploadFacts,
  actorUserId: string,
  storeId: string,
  now: Date,
) {
  assertUnfinished(asset, actorUserId)
  expenseReceiptPinnedStoreId(storeId)
  const current = time(now)
  if (
    asset.expiresAt.getTime() <= current ||
    !Number.isFinite(asset.expiresAt.getTime()) ||
    !["PENDING", "RETRYABLE", "CLAIMED"].includes(asset.uploadState) ||
    (asset.storageStoreId !== null && asset.storageStoreId !== storeId) ||
    (asset.uploadLeaseUntil !== null &&
      asset.uploadLeaseUntil.getTime() > current)
  )
    conflict()
  return {
    version: asset.version + 1,
    uploadLeaseUntil: new Date(
      Math.min(
        current + EXPENSE_RECEIPT_UPLOAD_LEASE_MS,
        asset.expiresAt.getTime(),
      ),
    ),
  }
}

export function expenseReceiptVerifiedCompletion(
  asset: ExpenseReceiptUploadFacts,
  input: {
    actorUserId: string
    claimId: string
    claimVersion: number
    storeId: string
    verifiedAt: Date
  },
  now: Date,
) {
  if (asset.actorUserId !== input.actorUserId) {
    throw new FinanceError(
      "FORBIDDEN",
      "Only the receipt creator can complete it.",
    )
  }
  const current = time(now)
  const verified = time(input.verifiedAt)
  if (asset.storageStoreId !== expenseReceiptPinnedStoreId(input.storeId))
    conflict()
  if (asset.uploadState === "VERIFIED") {
    if (
      asset.bytesDeletedAt !== null ||
      asset.cleanupClaimId !== null ||
      asset.verifiedClaimId !== input.claimId ||
      asset.verifiedClaimVersion !== input.claimVersion ||
      asset.verifiedAt?.getTime() !== verified
    )
      conflict()
    return { replay: true }
  }
  assertUnfinished(asset, input.actorUserId)
  if (
    asset.uploadState !== "CLAIMED" ||
    asset.version !== input.claimVersion ||
    asset.uploadClaimId !== input.claimId ||
    !asset.uploadClaimedAt ||
    !asset.uploadLeaseUntil ||
    asset.uploadLeaseUntil.getTime() <= current ||
    asset.expiresAt.getTime() <= current ||
    verified < asset.uploadClaimedAt.getTime() ||
    verified > current ||
    verified >= asset.expiresAt.getTime()
  )
    conflict()
  return { replay: false }
}
