import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { purchaseRecognitionText } from "./purchase-recognition-rules"
import { FinanceError, financeAmount } from "./rules"

/** Original agreement discovery includes pre-invoice sources, independent of device storage. */
export async function listFinancePurchaseRecognitions(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    supplierId: string
    cursor?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 30
  for (const id of [
    input.bookId,
    input.supplierId,
    ...(input.cursor !== undefined ? [input.cursor] : []),
  ])
    if (purchaseRecognitionText(id, "purchase source identity", 128) !== id)
      throw new FinanceError(
        "CONFLICT",
        "Purchase source identity is not canonical.",
      )
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new FinanceError(
      "CONFLICT",
      "Choose a purchase page size from 1 to 50.",
    )
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true, currencyCode: true },
      })
      if (!book || book.id !== input.bookId)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const supplier = await tx.financeSupplierAccount.findFirst({
        where: {
          id: input.supplierId,
          bookId: book.id,
          book: { tenantId: input.tenantId },
        },
        select: { id: true },
      })
      if (!supplier || supplier.id !== input.supplierId)
        throw new FinanceError(
          "NOT_FOUND",
          "Supplier account not found in this book.",
        )
      const scope = {
        tenantId: input.tenantId,
        bookId: book.id,
        supplierId: supplier.id,
      }
      const cursor = input.cursor
        ? await tx.financePurchaseRecognition.findFirst({
            where: { ...scope, id: input.cursor },
            select: { id: true, agreedAt: true },
          })
        : null
      if (
        input.cursor &&
        (!cursor || !Number.isFinite(cursor.agreedAt.getTime()))
      )
        throw new FinanceError(
          "NOT_FOUND",
          "Purchase cursor not found in this supplier account.",
        )
      const rows = await tx.financePurchaseRecognition.findMany({
        where: {
          ...scope,
          ...(cursor
            ? {
                OR: [
                  { agreedAt: { lt: cursor.agreedAt } },
                  { agreedAt: cursor.agreedAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          tenantId: true,
          bookId: true,
          supplierId: true,
          storeId: true,
          agreedAt: true,
          costBillId: true,
          costBill: {
            select: {
              id: true,
              bookId: true,
              supplierId: true,
              kind: true,
              description: true,
              totalMinor: true,
            },
          },
        },
        orderBy: [{ agreedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      })
      if (
        rows.length > limit + 1 ||
        new Set(rows.map((r) => r.id)).size !== rows.length
      )
        throw new FinanceError(
          "CONFLICT",
          "Purchase source page is incomplete or repeated.",
        )
      const validated = rows.map((row) => {
        if (
          row.tenantId !== input.tenantId ||
          row.bookId !== book.id ||
          row.supplierId !== supplier.id ||
          !row.id.trim() ||
          !row.storeId.trim() ||
          !Number.isFinite(row.agreedAt.getTime()) ||
          row.costBill.id !== row.costBillId ||
          row.costBill.bookId !== book.id ||
          row.costBill.supplierId !== supplier.id ||
          row.costBill.kind !== "PURCHASE_ACCRUAL"
        )
          throw new FinanceError(
            "CONFLICT",
            "Original purchase agreement ownership changed.",
          )
        const amountMinor = financeAmount(
          row.costBill.totalMinor.toString(),
        ).toString()
        return {
          id: row.id,
          bookId: row.bookId,
          supplierId: row.supplierId,
          storeId: row.storeId,
          agreedAt: row.agreedAt,
          description: purchaseRecognitionText(
            row.costBill.description,
            "purchase description",
            400,
          ),
          amountMinor,
        }
      })
      const items = validated.slice(0, limit)
      return {
        bookId: book.id,
        supplierId: supplier.id,
        currencyCode: book.currencyCode,
        items,
        nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
