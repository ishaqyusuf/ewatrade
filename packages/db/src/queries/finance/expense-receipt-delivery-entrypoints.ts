import type { PrismaClient } from "../../../generated/prisma/client"
import {
  getFinanceExpenseReceiptDeliveryAuthorityInTransaction,
  revalidateFinanceExpenseReceiptConsumedGrantInTransaction,
} from "./expense-receipt-delivery-authority"
import {
  consumeFinanceExpenseReceiptGrantInTransaction,
  issueFinanceExpenseReceiptGrantInTransaction,
} from "./expense-receipt-lifecycle"
import type { FinanceExpenseReceiptScope } from "./expense-receipt-rules"
import { FinanceError } from "./rules"

export { FinanceError } from "./rules"
export type ExpenseReceiptDeliveryAuthority = Awaited<
  ReturnType<typeof getFinanceExpenseReceiptDeliveryAuthorityInTransaction>
>
export type ExpenseReceiptGrantProtocol = {
  nonceDigest: string
  sessionDigest: string
  purpose: string
  version: number
}

export function assertSameExpenseReceiptDeliveryOriginal(
  actual: ExpenseReceiptDeliveryAuthority,
  expected: ExpenseReceiptDeliveryAuthority,
) {
  for (const key of ["tenantId", "bookId", "billId", "actorUserId"] as const)
    if (actual.scope[key] !== expected.scope[key])
      throw new FinanceError("CONFLICT", "Receipt access has changed.")
  for (const key of [
    "tenantId",
    "bookId",
    "billId",
    "assetId",
    "contentDigest",
    "contentType",
    "sizeBytes",
    "storageProvider",
    "storagePath",
    "storageStoreId",
  ] as const)
    if (actual.original[key] !== expected.original[key])
      throw new FinanceError("CONFLICT", "The original receipt has changed.")
  if (
    !(actual.original.verifiedAt instanceof Date) ||
    !(expected.original.verifiedAt instanceof Date) ||
    !Number.isFinite(actual.original.verifiedAt.getTime()) ||
    actual.original.verifiedAt.getTime() !==
      expected.original.verifiedAt.getTime()
  )
    throw new FinanceError("CONFLICT", "The original receipt has changed.")
}

/** Provider effects happen only after these bounded transactions commit. */
export function createFinanceExpenseReceiptDeliveryRepository(
  db: PrismaClient,
  input: FinanceExpenseReceiptScope & { assetId: string },
) {
  const scope = {
    tenantId: input.tenantId,
    bookId: input.bookId,
    billId: input.billId,
    actorUserId: input.actorUserId,
    assetId: input.assetId,
  }
  const bounds = { maxWait: 10_000, timeout: 30_000 }
  return {
    inspect: () =>
      db.$transaction(
        (tx) =>
          getFinanceExpenseReceiptDeliveryAuthorityInTransaction(tx, scope),
        bounds,
      ),
    issue: (protocol: ExpenseReceiptGrantProtocol) => {
      const held = structuredClone(protocol)
      return db.$transaction(
        (tx) =>
          issueFinanceExpenseReceiptGrantInTransaction(tx, {
            ...scope,
            nonceDigest: held.nonceDigest,
            sessionDigest: held.sessionDigest,
          }),
        bounds,
      )
    },
    consume: (protocol: ExpenseReceiptGrantProtocol) => {
      const held = structuredClone(protocol)
      return db.$transaction(
        (tx) =>
          consumeFinanceExpenseReceiptGrantInTransaction(tx, {
            ...held,
            ...scope,
          }),
        bounds,
      )
    },
    revalidate: (grant: ExpenseReceiptGrantProtocol & { grantId: string }) => {
      const held = structuredClone(grant)
      return db.$transaction(
        (tx) =>
          revalidateFinanceExpenseReceiptConsumedGrantInTransaction(tx, {
            ...held,
            ...scope,
          }),
        bounds,
      )
    },
  }
}

export type ExpenseReceiptDeliveryRepository = ReturnType<
  typeof createFinanceExpenseReceiptDeliveryRepository
>
