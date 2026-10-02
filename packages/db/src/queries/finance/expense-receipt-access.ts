import type {
  FinanceExpenseReceiptAsset,
  FinanceExpenseReceiptAuditKind,
  Prisma,
} from "../../../generated/prisma/client"
import { lockFinanceBook } from "./access"
import {
  type FinanceExpenseReceiptScope,
  assertFinanceExpenseReceiptAuthority,
} from "./expense-receipt-rules"
import { FinanceError } from "./rules"

type Tx = Prisma.TransactionClient
type Scope = FinanceExpenseReceiptScope

// All calls require an enclosing transaction. No storage I/O belongs inside it.
// Existing Finance commands lock Book before Membership. Retain that ordering,
// then lock Tenant, Expense and Asset for receipt mutations and current rechecks.
export async function authorize(
  tx: Tx,
  scope: Scope,
  action: "READ" | "CREATE_INTENT" | "ATTACH",
) {
  const book = await lockFinanceBook(tx, scope)
  await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${scope.tenantId} FOR SHARE`
  const tenant = await tx.tenant.findUnique({ where: { id: scope.tenantId } })
  const membership = await tx.membership.findFirst({
    where: { tenantId: scope.tenantId, userId: scope.actorUserId },
  })
  await tx.$queryRaw`SELECT id FROM "FinanceBill" WHERE id = ${scope.billId} AND "bookId" = ${scope.bookId} FOR SHARE`
  const expense = await tx.financeBill.findFirst({
    where: { id: scope.billId, bookId: scope.bookId },
  })
  assertFinanceExpenseReceiptAuthority({
    scope: {
      tenantId: scope.tenantId,
      actorUserId: scope.actorUserId,
      bookId: scope.bookId,
      billId: scope.billId,
    },
    book,
    tenant,
    membership,
    expense,
    action,
  })
  if (!tenant || !expense)
    throw new FinanceError("NOT_FOUND", "Expense not found.")
  return { tenant, expense }
}

export async function assetInScope(tx: Tx, scope: Scope, assetId: string) {
  await tx.$queryRaw`SELECT id FROM "FinanceExpenseReceiptAsset" WHERE id = ${assetId} AND "tenantId" = ${scope.tenantId} AND "bookId" = ${scope.bookId} AND "billId" = ${scope.billId} FOR UPDATE`
  const asset = await tx.financeExpenseReceiptAsset.findFirst({
    where: {
      id: assetId,
      tenantId: scope.tenantId,
      bookId: scope.bookId,
      billId: scope.billId,
    },
  })
  if (!asset) throw new FinanceError("NOT_FOUND", "Expense receipt not found.")
  return asset
}

export function metadata(asset: FinanceExpenseReceiptAsset) {
  return {
    id: asset.id,
    billId: asset.billId,
    originalFileName: asset.originalFileName,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    uploadState: asset.uploadState,
    safetyState: asset.safetyState,
    attachmentState: asset.attachmentState,
    createdAt: asset.createdAt,
    expiresAt: asset.expiresAt,
    verifiedAt: asset.verifiedAt,
    attachedAt: asset.attachedAt,
    withdrawnAt: asset.withdrawnAt,
    bytesDeletedAt: asset.bytesDeletedAt,
    retentionHold: asset.retentionHold,
  }
}

export async function audit(
  tx: Tx,
  asset: FinanceExpenseReceiptAsset,
  actorUserId: string,
  kind: FinanceExpenseReceiptAuditKind,
  occurredAt: Date,
) {
  await tx.financeExpenseReceiptAuditEvent.create({
    data: {
      tenantId: asset.tenantId,
      bookId: asset.bookId,
      billId: asset.billId,
      assetId: asset.id,
      actorUserId,
      kind,
      assetVersion: asset.version,
      occurredAt,
    },
  })
}
