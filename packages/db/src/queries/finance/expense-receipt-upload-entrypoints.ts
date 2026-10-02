import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceExpenseReceiptScope } from "./expense-receipt-rules"
import {
  getFinanceExpenseReceiptUploadAuthorityInTransaction,
  revalidateFinanceExpenseReceiptUploadClaimInTransaction,
} from "./expense-receipt-upload-authority"
import {
  claimFinanceExpenseReceiptUploadInTransaction,
  recordFinanceExpenseReceiptVerifiedInTransaction,
} from "./expense-receipts"
import { FinanceError } from "./rules"

export { FinanceError } from "./rules"
export type ExpenseReceiptUploadClaim = Awaited<
  ReturnType<typeof claimFinanceExpenseReceiptUploadInTransaction>
>
export type ExpenseReceiptUploadOriginal = ExpenseReceiptUploadClaim["target"]
export type ExpenseReceiptUploadAuthority = Awaited<
  ReturnType<typeof getFinanceExpenseReceiptUploadAuthorityInTransaction>
>

export function assertSameExpenseReceiptUploadOriginal(
  actual: ExpenseReceiptUploadOriginal,
  expected: ExpenseReceiptUploadOriginal,
) {
  for (const key of [
    "tenantId",
    "bookId",
    "billId",
    "assetId",
    "actorUserId",
    "contentDigest",
    "contentType",
    "sizeBytes",
  ] as const) {
    if (actual[key] !== expected[key])
      throw new FinanceError(
        "CONFLICT",
        "The original receipt identity has changed.",
      )
  }
  for (const key of ["createdAt", "expiresAt"] as const) {
    if (
      !(actual[key] instanceof Date) ||
      !(expected[key] instanceof Date) ||
      !Number.isFinite(actual[key].getTime()) ||
      actual[key].getTime() !== expected[key].getTime()
    )
      throw new FinanceError(
        "CONFLICT",
        "The original receipt identity has changed.",
      )
  }
}

/** Trusted server facade. Each callback commits before any provider operation. */
export function createFinanceExpenseReceiptUploadRepository(
  db: PrismaClient,
  input: FinanceExpenseReceiptScope & { assetId: string },
) {
  const scope = {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    bookId: input.bookId,
    billId: input.billId,
    assetId: input.assetId,
  }
  const bounds = { maxWait: 10_000, timeout: 30_000 }
  return {
    load: () =>
      db.$transaction(
        (tx) => getFinanceExpenseReceiptUploadAuthorityInTransaction(tx, scope),
        bounds,
      ),
    claim: (storeId: string, original: ExpenseReceiptUploadOriginal) => {
      const held = structuredClone(original)
      return db.$transaction(async (tx) => {
        const current =
          await getFinanceExpenseReceiptUploadAuthorityInTransaction(tx, scope)
        assertSameExpenseReceiptUploadOriginal(current.target, held)
        if (current.kind !== "READY")
          throw new FinanceError(
            "CONFLICT",
            "This receipt upload is already claimed or complete.",
          )
        return claimFinanceExpenseReceiptUploadInTransaction(tx, {
          ...scope,
          storageStoreId: storeId,
        })
      }, bounds)
    },
    revalidate: (claim: ExpenseReceiptUploadClaim) => {
      const held = structuredClone(claim)
      if (
        held.scope.tenantId !== scope.tenantId ||
        held.scope.actorUserId !== scope.actorUserId ||
        held.scope.bookId !== scope.bookId ||
        held.scope.billId !== scope.billId ||
        held.target.assetId !== scope.assetId
      )
        throw new FinanceError(
          "CONFLICT",
          "The receipt claim belongs to another request.",
        )
      return db.$transaction(
        (tx) =>
          revalidateFinanceExpenseReceiptUploadClaimInTransaction(tx, held),
        bounds,
      )
    },
    complete: (
      claim: ExpenseReceiptUploadClaim,
      stored: Parameters<
        typeof recordFinanceExpenseReceiptVerifiedInTransaction
      >[1]["stored"],
    ) => {
      const held = structuredClone(claim)
      const original = structuredClone(stored)
      assertSameExpenseReceiptUploadOriginal(held.target, {
        ...held.target,
        ...scope,
      })
      return db.$transaction(
        (tx) =>
          recordFinanceExpenseReceiptVerifiedInTransaction(tx, {
            ...scope,
            claimId: held.claimId,
            claimVersion: held.claimVersion,
            stored: original,
          }),
        bounds,
      )
    },
  }
}

export type ExpenseReceiptUploadRepository = ReturnType<
  typeof createFinanceExpenseReceiptUploadRepository
>
