import type { PrismaClient } from "../../../generated/prisma/client"
import {
  attachFinanceExpenseReceiptInTransaction,
  withdrawFinanceExpenseReceiptInTransaction,
} from "./expense-receipt-lifecycle"
import type { FinanceExpenseReceiptScope } from "./expense-receipt-rules"
import {
  type CreateFinanceExpenseReceiptInput,
  createFinanceExpenseReceiptInTransaction,
  getFinanceExpenseReceiptInTransaction,
  listFinanceExpenseReceiptsInTransaction,
} from "./expense-receipts"

export function createFinanceExpenseReceipt(
  db: PrismaClient,
  input: CreateFinanceExpenseReceiptInput,
) {
  return db.$transaction(
    (tx) => createFinanceExpenseReceiptInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export function getFinanceExpenseReceipt(
  db: PrismaClient,
  input: FinanceExpenseReceiptScope & { assetId: string },
) {
  return db.$transaction(
    (tx) => getFinanceExpenseReceiptInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export function listFinanceExpenseReceipts(
  db: PrismaClient,
  input: FinanceExpenseReceiptScope & { limit?: number; cursor?: string },
) {
  return db.$transaction(
    (tx) => listFinanceExpenseReceiptsInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export function attachFinanceExpenseReceipt(
  db: PrismaClient,
  input: Parameters<typeof attachFinanceExpenseReceiptInTransaction>[1],
) {
  const snapshot = structuredClone(input)
  return db.$transaction(
    (tx) => attachFinanceExpenseReceiptInTransaction(tx, snapshot),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export function withdrawFinanceExpenseReceipt(
  db: PrismaClient,
  input: Parameters<typeof withdrawFinanceExpenseReceiptInTransaction>[1],
) {
  const snapshot = structuredClone(input)
  return db.$transaction(
    (tx) => withdrawFinanceExpenseReceiptInTransaction(tx, snapshot),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
