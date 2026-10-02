import { z } from "zod"
import type {
  FinanceExpenseReceiptAsset,
  Prisma,
  Tenant,
} from "../../../generated/prisma/client"
import { financeDocumentCommand } from "./commands"
import {
  assetInScope,
  audit,
  authorize,
  metadata,
} from "./expense-receipt-access"
import {
  EXPENSE_RECEIPT_ATTACHED_LIMIT,
  expenseReceiptPinnedStoreId,
} from "./expense-receipt-metadata-rules"
import {
  FINANCE_EXPENSE_RECEIPT_DOWNLOAD_MS,
  type FinanceExpenseReceiptContentType,
  type FinanceExpenseReceiptScope,
  assertFinanceExpenseReceiptAttachment,
  assertFinanceExpenseReceiptDownload,
  assertFinanceExpenseReceiptSafetyCoverage,
  assertFinanceExpenseReceiptStored,
} from "./expense-receipt-rules"
import { FinanceError } from "./rules"

type Tx = Prisma.TransactionClient
type Scope = FinanceExpenseReceiptScope
type Command = Scope & { assetId: string; clientCommandId: string }

export const FINANCE_EXPENSE_RECEIPT_GRANT_VERSION = 1
export const FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE =
  "FINANCE_EXPENSE_RECEIPT_DOWNLOAD"
export const FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE =
  "finance-expense-receipt-original-safety"

const qaProvenance = z
  .object({
    purpose: z.literal(FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE),
    version: z.literal(1),
    runtime: z.literal("qa_fixture"),
    attestation: z.unknown(),
  })
  .strict()

function unavailable(): never {
  throw new FinanceError(
    "FORBIDDEN",
    "Safe original receipt access is unavailable.",
  )
}

function original(asset: FinanceExpenseReceiptAsset) {
  if (
    !asset.verifiedAt ||
    !asset.storageStoreId ||
    asset.storageProvider !== "vercel_blob_private"
  )
    unavailable()
  expenseReceiptPinnedStoreId(asset.storageStoreId)
  const intent = {
    ...asset,
    assetId: asset.id,
    contentType: asset.contentType as FinanceExpenseReceiptContentType,
  }
  const stored = {
    assetId: asset.id,
    tenantId: asset.tenantId,
    bookId: asset.bookId,
    billId: asset.billId,
    contentDigest: asset.contentDigest,
    contentType: asset.contentType as FinanceExpenseReceiptContentType,
    sizeBytes: asset.sizeBytes,
    storageProvider: "vercel_blob_private" as const,
    storagePath: asset.storagePath,
    verifiedAt: asset.verifiedAt,
  }
  assertFinanceExpenseReceiptStored(intent, stored)
  return { intent, stored }
}

/** Necessary persisted safety/runtime gate. There is no SAFE writer or approved live adapter. */
export function assertFinanceExpenseReceiptPersistedSafety(
  asset: FinanceExpenseReceiptAsset,
  tenant: Pick<Tenant, "dataClassification">,
  now: Date,
) {
  const productionProfile = [
    process.env.DEV_PROFILE,
    process.env.APP_ENV,
    process.env.EWATRADE_ENV_MODE,
  ].some((value) => {
    const normalized = value?.trim().toLowerCase()
    return normalized === "prod" || normalized === "production"
  })
  if (
    !["development", "test"].includes(process.env.NODE_ENV ?? "") ||
    productionProfile ||
    tenant.dataClassification !== "QA"
  )
    unavailable()
  if (
    asset.uploadState !== "VERIFIED" ||
    asset.safetyState !== "SAFE" ||
    asset.bytesDeletedAt !== null ||
    asset.cleanupClaimId !== null ||
    asset.uploadClaimId !== null ||
    !asset.safetyReviewedAt ||
    !asset.verifiedAt ||
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(asset.safetyReviewedAt.getTime()) ||
    asset.safetyReviewedAt < asset.verifiedAt ||
    asset.safetyReviewedAt > now
  )
    unavailable()
  const envelope = qaProvenance.safeParse(asset.safetyAttestation)
  if (!envelope.success) unavailable()
  const { stored } = original(asset)
  const evidence = assertFinanceExpenseReceiptSafetyCoverage(
    stored,
    envelope.data.attestation,
  )
  if (
    evidence.source !== "qa_fixture" ||
    evidence.provider !== "qa_fixture" ||
    evidence.modelVersion !== "deterministic-1"
  )
    unavailable()
  return {
    intent: {
      ...asset,
      assetId: asset.id,
      contentType: asset.contentType as FinanceExpenseReceiptContentType,
    },
    stored,
  }
}

function commandPayload(scope: Scope, asset: FinanceExpenseReceiptAsset) {
  return {
    tenantId: scope.tenantId,
    bookId: scope.bookId,
    billId: scope.billId,
    actorUserId: scope.actorUserId,
    assetId: asset.id,
    originalActorUserId: asset.actorUserId,
    originalFileName: asset.originalFileName,
    contentDigest: asset.contentDigest,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
  }
}

function commandIdentity(value: string) {
  if (value.length < 8 || value.length > 128 || !value.trim())
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A stable receipt command identity is required.",
    )
}

export async function attachFinanceExpenseReceiptInTransaction(
  tx: Tx,
  input: Command,
) {
  commandIdentity(input.clientCommandId)
  const { tenant, expense } = await authorize(tx, input, "READ")
  const asset = await assetInScope(tx, input, input.assetId)
  const result = await financeDocumentCommand(
    tx,
    input,
    "EXPENSE_RECEIPT_ATTACH",
    commandPayload(input, asset),
    async () => {
      const now = new Date()
      if (expense.voidedAt || asset.attachmentState !== "UNATTACHED")
        throw new FinanceError(
          "CONFLICT",
          "This Expense cannot attach the receipt.",
        )
      if (asset.actorUserId !== input.actorUserId)
        throw new FinanceError(
          "FORBIDDEN",
          "Only the receipt creator can attach it.",
        )
      const { intent, stored } = assertFinanceExpenseReceiptPersistedSafety(
        asset,
        tenant,
        now,
      )
      assertFinanceExpenseReceiptAttachment({
        scope: {
          tenantId: input.tenantId,
          bookId: input.bookId,
          billId: input.billId,
          actorUserId: input.actorUserId,
        },
        intent,
        stored,
        safetyState: asset.safetyState,
        now,
      })
      const attached = await tx.financeExpenseReceiptAsset.count({
        where: {
          tenantId: input.tenantId,
          bookId: input.bookId,
          billId: input.billId,
          attachedAt: { not: null },
        },
      })
      if (attached >= EXPENSE_RECEIPT_ATTACHED_LIMIT)
        throw new FinanceError(
          "CONFLICT",
          "The Expense receipt attachment limit has been reached.",
        )
      const updated = await tx.financeExpenseReceiptAsset.update({
        where: { id: asset.id },
        data: {
          attachmentState: "ATTACHED",
          attachedAt: now,
          attachedById: input.actorUserId,
          version: asset.version + 1,
        },
      })
      await audit(tx, updated, input.actorUserId, "ATTACHED", now)
      return { id: updated.id }
    },
  )
  if (result.id !== asset.id)
    throw new FinanceError(
      "CONFLICT",
      "The receipt command cannot be recovered.",
    )
  return metadata(await assetInScope(tx, input, result.id))
}

export async function withdrawFinanceExpenseReceiptInTransaction(
  tx: Tx,
  input: Command,
) {
  commandIdentity(input.clientCommandId)
  await authorize(tx, input, "READ")
  const asset = await assetInScope(tx, input, input.assetId)
  const result = await financeDocumentCommand(
    tx,
    input,
    "EXPENSE_RECEIPT_WITHDRAW",
    commandPayload(input, asset),
    async () => {
      if (asset.attachmentState !== "ATTACHED" || !asset.attachedAt)
        throw new FinanceError(
          "CONFLICT",
          "An attached receipt is required for withdrawal.",
        )
      const now = new Date()
      const updated = await tx.financeExpenseReceiptAsset.update({
        where: { id: asset.id },
        data: {
          attachmentState: "WITHDRAWN",
          withdrawnAt: now,
          withdrawnById: input.actorUserId,
          version: asset.version + 1,
        },
      })
      await tx.financeExpenseReceiptDownloadGrant.updateMany({
        where: {
          tenantId: asset.tenantId,
          bookId: asset.bookId,
          billId: asset.billId,
          assetId: asset.id,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      })
      await audit(tx, updated, input.actorUserId, "WITHDRAWN", now)
      return { id: updated.id }
    },
  )
  if (result.id !== asset.id)
    throw new FinanceError(
      "CONFLICT",
      "The receipt command cannot be recovered.",
    )
  return metadata(await assetInScope(tx, input, result.id))
}

function assertHash(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A hashed receipt grant identity is required.",
    )
}

function downloadable(
  asset: FinanceExpenseReceiptAsset,
  tenant: Pick<Tenant, "dataClassification">,
  now: Date,
) {
  if (asset.attachmentState !== "ATTACHED" || !asset.attachedAt) unavailable()
  return assertFinanceExpenseReceiptPersistedSafety(asset, tenant, now)
}

/** Internal only: root supplies hashes derived from authenticated session and random nonce. */
export async function issueFinanceExpenseReceiptGrantInTransaction(
  tx: Tx,
  input: Scope & {
    assetId: string
    sessionDigest: string
    nonceDigest: string
  },
) {
  assertHash(input.sessionDigest)
  assertHash(input.nonceDigest)
  const { tenant } = await authorize(tx, input, "READ")
  const asset = await assetInScope(tx, input, input.assetId)
  const now = new Date()
  const { intent, stored } = downloadable(asset, tenant, now)
  const grantData = {
    tenantId: asset.tenantId,
    bookId: asset.bookId,
    billId: asset.billId,
    assetId: asset.id,
    actorUserId: input.actorUserId,
    sessionDigest: input.sessionDigest,
    nonceDigest: input.nonceDigest,
    contentDigest: asset.contentDigest,
    purpose: FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE,
    version: FINANCE_EXPENSE_RECEIPT_GRANT_VERSION,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + FINANCE_EXPENSE_RECEIPT_DOWNLOAD_MS),
  }
  assertFinanceExpenseReceiptDownload({
    scope: input,
    intent,
    stored,
    grant: grantData,
    safetyState: asset.safetyState,
    bytesDeletedAt: asset.bytesDeletedAt,
    now,
  })
  const duplicate = await tx.financeExpenseReceiptDownloadGrant.findUnique({
    where: { nonceDigest: input.nonceDigest },
    select: { id: true },
  })
  if (duplicate)
    throw new FinanceError(
      "CONFLICT",
      "This receipt grant identity has already been used.",
    )
  const grant = await tx.financeExpenseReceiptDownloadGrant.create({
    data: grantData,
  })
  await audit(tx, asset, input.actorUserId, "DOWNLOAD_GRANTED", now)
  return {
    id: grant.id,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
    purpose: grant.purpose,
    version: grant.version,
  }
}

/** Signature/authentication is root-owned. No bytes or raw grant secrets are returned. */
export async function consumeFinanceExpenseReceiptGrantInTransaction(
  tx: Tx,
  input: Scope & {
    assetId: string
    sessionDigest: string
    nonceDigest: string
    purpose: string
    version: number
  },
) {
  assertHash(input.sessionDigest)
  assertHash(input.nonceDigest)
  if (
    input.purpose !== FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE ||
    input.version !== FINANCE_EXPENSE_RECEIPT_GRANT_VERSION
  )
    unavailable()
  const { tenant } = await authorize(tx, input, "READ")
  const asset = await assetInScope(tx, input, input.assetId)
  const now = new Date()
  const { intent, stored } = downloadable(asset, tenant, now)
  await tx.$queryRaw`SELECT id FROM "FinanceExpenseReceiptDownloadGrant" WHERE "nonceDigest" = ${input.nonceDigest} AND "tenantId" = ${input.tenantId} AND "bookId" = ${input.bookId} AND "billId" = ${input.billId} AND "assetId" = ${input.assetId} FOR UPDATE`
  const grant = await tx.financeExpenseReceiptDownloadGrant.findUnique({
    where: { nonceDigest: input.nonceDigest },
  })
  if (
    !grant ||
    grant.tenantId !== input.tenantId ||
    grant.bookId !== input.bookId ||
    grant.billId !== input.billId ||
    grant.assetId !== input.assetId ||
    grant.actorUserId !== input.actorUserId ||
    grant.sessionDigest !== input.sessionDigest ||
    grant.purpose !== input.purpose ||
    grant.version !== input.version ||
    grant.consumedAt !== null ||
    grant.revokedAt !== null
  )
    unavailable()
  assertFinanceExpenseReceiptDownload({
    scope: input,
    intent,
    stored,
    grant,
    safetyState: asset.safetyState,
    bytesDeletedAt: asset.bytesDeletedAt,
    now,
  })
  // Expiry and consumption use this statement's actual database UTC time,
  // rather than the earlier application snapshot or transaction-start time.
  const changed = await tx.$queryRaw<Array<{ consumedAt: Date }>>`
    UPDATE "FinanceExpenseReceiptDownloadGrant"
    SET "consumedAt" = statement_timestamp() AT TIME ZONE 'UTC'
    WHERE id = ${grant.id}
      AND "tenantId" = ${input.tenantId} AND "bookId" = ${input.bookId}
      AND "billId" = ${input.billId} AND "assetId" = ${asset.id}
      AND "actorUserId" = ${input.actorUserId}
      AND "nonceDigest" = ${input.nonceDigest} AND "sessionDigest" = ${input.sessionDigest}
      AND purpose = ${input.purpose} AND version = ${input.version}
      AND "contentDigest" = ${asset.contentDigest}
      AND "consumedAt" IS NULL AND "revokedAt" IS NULL
      AND "issuedAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
      AND "expiresAt" > (statement_timestamp() AT TIME ZONE 'UTC')
      AND "expiresAt" <= "issuedAt" + INTERVAL '60 seconds'
    RETURNING "consumedAt"`
  const consumed = changed[0]
  if (changed.length !== 1 || !consumed) unavailable()
  await audit(
    tx,
    asset,
    input.actorUserId,
    "DOWNLOAD_CONSUMED",
    consumed.consumedAt,
  )
  // Trusted storage orchestration only. Merchant endpoints must never serialize this descriptor.
  return {
    grantId: grant.id,
    scope: {
      tenantId: asset.tenantId,
      bookId: asset.bookId,
      billId: asset.billId,
      actorUserId: input.actorUserId,
      dataClassification: tenant.dataClassification,
    },
    original: {
      ...stored,
      storageStoreId: expenseReceiptPinnedStoreId(asset.storageStoreId ?? ""),
    },
  }
}
