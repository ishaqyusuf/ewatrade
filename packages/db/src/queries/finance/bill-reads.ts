import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  type ListSortKey,
  buildScopedListCursorWhere,
  buildScopedListPageWhere,
} from "../list-sort"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

export async function listFinanceBills(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    query?: string
    storeId?: string
    status?: "UNPAID" | "PARTIAL" | "PAID" | "VOID"
    cursor?: string
    limit?: number
    sort?: {
      direction: "asc" | "desc"
      field:
        | "incurredAt"
        | "description"
        | "payeeName"
        | "totalMinor"
        | "paidMinor"
    }
  },
) {
  const limit = input.limit ?? 30
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (input.query?.length ?? 0) > 160
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid expense filters.")
  }
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const where: Prisma.FinanceBillWhereInput = {
        bookId: book.id,
        kind: "EXPENSE",
        voidedAt: input.status === "VOID" ? { not: null } : null,
        storeId: input.storeId,
        ...(input.query
          ? {
              OR: [
                { payeeName: { contains: input.query, mode: "insensitive" } },
                { description: { contains: input.query, mode: "insensitive" } },
                { reference: { contains: input.query, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(input.status === "UNPAID"
          ? { paidMinor: BigInt(0) }
          : input.status === "PAID"
            ? { paidMinor: { equals: tx.financeBill.fields.totalMinor } }
            : input.status === "PARTIAL"
              ? {
                  paidMinor: {
                    gt: BigInt(0),
                    lt: tx.financeBill.fields.totalMinor,
                  },
                }
              : {}),
      }
      const sortFields: Array<{
        direction: "asc" | "desc"
        field:
          | "incurredAt"
          | "description"
          | "payeeName"
          | "totalMinor"
          | "paidMinor"
      }> = input.sort
        ? [
            {
              field: input.sort.field,
              direction: input.sort.direction,
            },
          ]
        : [{ field: "incurredAt", direction: "desc" }]
      const tieDirection = input.sort ? "asc" : "desc"
      const cursor = input.cursor
        ? await tx.financeBill.findFirst({
            where: buildScopedListCursorWhere(
              where,
              input.cursor,
            ) as Prisma.FinanceBillWhereInput,
          })
        : null
      if (input.cursor && !cursor)
        throw new FinanceError(
          "CONFLICT",
          "The expense list changed. Refresh to continue.",
        )
      const orderBy = [
        ...sortFields.map(({ field, direction }) => ({ [field]: direction })),
        { id: tieDirection },
      ] as Prisma.FinanceBillOrderByWithRelationInput[]
      const continuationKeys: ListSortKey[] = cursor
        ? [
            ...sortFields.map(({ field, direction }) => ({
              field,
              direction,
              value: cursor[field],
            })),
            { field: "id", direction: tieDirection, value: cursor.id },
          ]
        : []
      const [rows, totals, count] = await Promise.all([
        tx.financeBill.findMany({
          where: cursor
            ? (buildScopedListPageWhere(
                where,
                continuationKeys,
              ) as Prisma.FinanceBillWhereInput)
            : where,
          orderBy,
          take: limit + 1,
        }),
        tx.financeBill.aggregate({
          where: { AND: [where, { voidedAt: null }] },
          _sum: { totalMinor: true, paidMinor: true },
        }),
        tx.financeBill.count({ where }),
      ])
      const totalMinor = totals._sum.totalMinor ?? BigInt(0)
      const paidMinor = totals._sum.paidMinor ?? BigInt(0)
      const page = rows.slice(0, limit)
      return {
        currencyCode: book.currencyCode,
        count,
        summary: {
          incurredMinor: totalMinor.toString(),
          paidAgainstBillsMinor: paidMinor.toString(),
          outstandingMinor: (totalMinor - paidMinor).toString(),
        },
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
        items: page.map((bill) => ({
          ...bill,
          totalMinor: bill.totalMinor.toString(),
          paidMinor: bill.paidMinor.toString(),
          outstandingMinor: bill.voidedAt
            ? "0"
            : (bill.totalMinor - bill.paidMinor).toString(),
          status: bill.voidedAt
            ? ("VOID" as const)
            : bill.paidMinor === bill.totalMinor
              ? ("PAID" as const)
              : bill.paidMinor > BigInt(0)
                ? ("PARTIAL" as const)
                : ("UNPAID" as const),
        })),
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

export async function getFinanceBill(
  db: PrismaClient,
  input: FinanceActor & { bookId: string; billId: string },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const bill = await tx.financeBill.findFirst({
        where: {
          id: input.billId,
          bookId: input.bookId,
          kind: "EXPENSE",
          book: { tenantId: input.tenantId },
        },
        include: {
          lines: {
            include: { account: { select: { name: true } } },
            orderBy: { position: "asc" },
          },
          payments: {
            include: { account: { select: { name: true, purpose: true } } },
            orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
          },
        },
      })
      if (!bill)
        throw new FinanceError(
          "NOT_FOUND",
          "Expense not found in this business.",
        )
      return {
        ...bill,
        totalMinor: bill.totalMinor.toString(),
        paidMinor: bill.paidMinor.toString(),
        outstandingMinor: bill.voidedAt
          ? "0"
          : (bill.totalMinor - bill.paidMinor).toString(),
        lines: bill.lines.map((line) => ({
          ...line,
          amountMinor: line.amountMinor.toString(),
        })),
        payments: bill.payments.map((payment) => ({
          ...payment,
          amountMinor: payment.amountMinor.toString(),
          funding:
            payment.account.purpose === "CAPITAL"
              ? ("OWNER_CAPITAL" as const)
              : ("BUSINESS_ACCOUNT" as const),
        })),
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
