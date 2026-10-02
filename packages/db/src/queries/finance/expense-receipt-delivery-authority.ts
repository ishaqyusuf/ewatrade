import type {
  FinanceExpenseReceiptAsset,
  FinanceExpenseReceiptDownloadGrant,
  Prisma,
  QaDataClassification,
} from "../../../generated/prisma/client"
import { assetInScope, authorize } from "./expense-receipt-access"
import {
  FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE,
  FINANCE_EXPENSE_RECEIPT_GRANT_VERSION,
  assertFinanceExpenseReceiptPersistedSafety,
} from "./expense-receipt-lifecycle"
import { expenseReceiptPinnedStoreId } from "./expense-receipt-metadata-rules"
import type {
  FinanceExpenseReceiptScope,
  FinanceExpenseReceiptStored,
} from "./expense-receipt-rules"
import { FinanceError } from "./rules"

const DELIVERY_GRANT_MAX_MS = 60_000

type Tx = Prisma.TransactionClient
type Scope = FinanceExpenseReceiptScope
type Input = Scope & {
  assetId: string
  grantId: string
  nonceDigest: string
  sessionDigest: string
  purpose: string
  version: number
}
type StoredOriginal = FinanceExpenseReceiptStored & { storageStoreId: string }

export type FinanceExpenseReceiptDeliveryAuthority = {
  scope: Scope & { dataClassification: QaDataClassification }
  original: StoredOriginal
}

function unavailable(): never {
  throw new FinanceError(
    "FORBIDDEN",
    "Safe original receipt access is unavailable.",
  )
}

function invalidGrantInput(): never {
  throw new FinanceError(
    "INVALID_JOURNAL",
    "A hashed receipt grant identity is required.",
  )
}

function safeDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime())
}

function assertHash(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) invalidGrantInput()
}

function attachedOriginal(
  asset: FinanceExpenseReceiptAsset,
  tenant: { dataClassification: QaDataClassification },
  now: Date,
): StoredOriginal {
  const storageStoreId = asset.storageStoreId
  if (
    asset.attachmentState !== "ATTACHED" ||
    !safeDate(asset.attachedAt) ||
    asset.attachedById === null ||
    asset.attachedById.length === 0 ||
    asset.withdrawnAt !== null ||
    asset.withdrawnById !== null ||
    storageStoreId === null ||
    asset.uploadClaimId !== null ||
    asset.uploadLeaseUntil !== null ||
    asset.cleanupClaimId !== null ||
    asset.cleanupLeaseUntil !== null ||
    asset.bytesDeletedAt !== null ||
    !safeDate(asset.createdAt) ||
    !safeDate(asset.expiresAt) ||
    asset.expiresAt.getTime() <= asset.createdAt.getTime() ||
    !safeDate(asset.uploadClaimedAt) ||
    !safeDate(asset.verifiedAt) ||
    !safeDate(asset.safetyReviewedAt) ||
    !Number.isSafeInteger(asset.version) ||
    asset.version < 1 ||
    !asset.verifiedClaimId ||
    !Number.isSafeInteger(asset.verifiedClaimVersion) ||
    asset.verifiedClaimVersion === null ||
    asset.verifiedClaimVersion < 1 ||
    asset.version <= asset.verifiedClaimVersion ||
    asset.uploadClaimedAt.getTime() < asset.createdAt.getTime() ||
    asset.uploadClaimedAt.getTime() > asset.verifiedAt.getTime() ||
    asset.verifiedAt.getTime() >= asset.expiresAt.getTime() ||
    asset.attachedAt.getTime() < asset.verifiedAt.getTime() ||
    asset.attachedAt.getTime() > now.getTime()
  )
    unavailable()

  const { stored } = assertFinanceExpenseReceiptPersistedSafety(
    asset,
    tenant,
    now,
  )
  return {
    ...stored,
    storageStoreId: expenseReceiptPinnedStoreId(storageStoreId),
  }
}

function assertConsumedGrant(
  grant: FinanceExpenseReceiptDownloadGrant | null,
  input: Input,
  asset: FinanceExpenseReceiptAsset,
  now: Date,
) {
  if (
    !grant ||
    grant.id !== input.grantId ||
    grant.tenantId !== input.tenantId ||
    grant.bookId !== input.bookId ||
    grant.billId !== input.billId ||
    grant.assetId !== input.assetId ||
    grant.actorUserId !== input.actorUserId ||
    grant.sessionDigest !== input.sessionDigest ||
    grant.nonceDigest !== input.nonceDigest ||
    grant.contentDigest !== asset.contentDigest ||
    grant.purpose !== input.purpose ||
    grant.version !== input.version ||
    grant.consumedAt === null ||
    grant.revokedAt !== null ||
    !safeDate(grant.issuedAt) ||
    !safeDate(grant.consumedAt) ||
    !safeDate(grant.expiresAt) ||
    !safeDate(asset.attachedAt) ||
    grant.issuedAt.getTime() < asset.attachedAt.getTime() ||
    grant.issuedAt.getTime() > grant.consumedAt.getTime() ||
    grant.consumedAt.getTime() > now.getTime() ||
    grant.expiresAt.getTime() <= now.getTime() ||
    grant.expiresAt.getTime() <= grant.issuedAt.getTime() ||
    grant.expiresAt.getTime() - grant.issuedAt.getTime() > DELIVERY_GRANT_MAX_MS
  )
    unavailable()
}

/** Load the current Owner/Admin's attached safe original descriptor for trusted orchestration. */
export async function getFinanceExpenseReceiptDeliveryAuthorityInTransaction(
  tx: Tx,
  input: Scope & { assetId: string },
): Promise<FinanceExpenseReceiptDeliveryAuthority> {
  const snapshot = structuredClone(input)
  const { tenant } = await authorize(tx, snapshot, "READ")
  const asset = await assetInScope(tx, snapshot, snapshot.assetId)
  const now = new Date()
  const original = attachedOriginal(asset, tenant, now)
  return {
    scope: {
      tenantId: snapshot.tenantId,
      bookId: snapshot.bookId,
      billId: snapshot.billId,
      actorUserId: snapshot.actorUserId,
      dataClassification: tenant.dataClassification,
    },
    original: structuredClone(original),
  }
}

/** Reauthorize a previously consumed grant immediately before returning bytes. */
export async function revalidateFinanceExpenseReceiptConsumedGrantInTransaction(
  tx: Tx,
  inputValue: Input,
): Promise<FinanceExpenseReceiptDeliveryAuthority> {
  const input: Input = structuredClone(inputValue)
  assertHash(input.nonceDigest)
  assertHash(input.sessionDigest)
  if (
    input.purpose !== FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE ||
    input.version !== FINANCE_EXPENSE_RECEIPT_GRANT_VERSION ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.grantId)
  )
    unavailable()

  const { tenant } = await authorize(tx, input, "READ")
  const asset = await assetInScope(tx, input, input.assetId)

  await tx.$queryRaw`
    SELECT id FROM "FinanceExpenseReceiptDownloadGrant"
    WHERE id = ${input.grantId}
      AND "nonceDigest" = ${input.nonceDigest}
      AND "tenantId" = ${input.tenantId}
      AND "bookId" = ${input.bookId}
      AND "billId" = ${input.billId}
      AND "assetId" = ${input.assetId}
    FOR UPDATE`
  const grant = await tx.financeExpenseReceiptDownloadGrant.findFirst({
    where: {
      id: input.grantId,
      tenantId: input.tenantId,
      bookId: input.bookId,
      billId: input.billId,
      assetId: input.assetId,
      nonceDigest: input.nonceDigest,
    },
  })
  // The grant may expire while the row lock/read waits. Evaluate its lifetime
  // against a fresh clock after the awaited database operation.
  const checkedAt = new Date()
  const original = attachedOriginal(asset, tenant, checkedAt)
  assertConsumedGrant(grant, input, asset, checkedAt)

  return {
    scope: {
      tenantId: input.tenantId,
      bookId: input.bookId,
      billId: input.billId,
      actorUserId: input.actorUserId,
      dataClassification: tenant.dataClassification,
    },
    original: structuredClone(original),
  }
}
