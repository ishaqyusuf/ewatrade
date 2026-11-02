import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CommercialPaymentMethod,
  CommercialPaymentType,
} from "../../generated/prisma/enums"

export type CommercialPaymentMethodFilter =
  | "bank_transfer"
  | "card"
  | "cash"
  | "other"
  | "pos"

/** Filters shared by the received-payments list and its totals. */
export type CommercialPaymentListFilter = {
  createdByUserId?: string
  methods?: CommercialPaymentMethodFilter[]
  query?: string
  recordedAfter?: Date
  recordedBefore?: Date
  storeId?: string
  tenantId: string
}

const METHOD = {
  bank_transfer: CommercialPaymentMethod.BANK_TRANSFER,
  card: CommercialPaymentMethod.CARD,
  cash: CommercialPaymentMethod.CASH,
  other: CommercialPaymentMethod.OTHER,
  pos: CommercialPaymentMethod.POS,
} as const

/**
 * Received payments in the caller's Order scope: money in only (refunds and
 * customer-credit settlements stay with their orders). Search matches the
 * reference, the team member who recorded it, and the order's number and
 * customer.
 */
export async function commercialPaymentListWhere(
  db: Pick<PrismaClient, "user">,
  input: CommercialPaymentListFilter,
) {
  const query = input.query?.trim()
  const matchingActors = query
    ? await db.user.findMany({
        select: { id: true },
        where: {
          memberships: { some: { tenantId: input.tenantId } },
          OR: [
            { displayName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
      })
    : []
  const methods = input.methods?.length
    ? [...new Set(input.methods)].map((method) => METHOD[method])
    : undefined
  const baseWhere: Prisma.CommercialOrderPaymentWhereInput = {
    tenantId: input.tenantId,
    order: {
      is: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        createdByUserId: input.createdByUserId,
      },
    },
    type: CommercialPaymentType.PAYMENT,
    method: methods
      ? { in: methods }
      : { not: CommercialPaymentMethod.CUSTOMER_CREDIT },
    ...(input.recordedAfter || input.recordedBefore
      ? {
          recordedAt: {
            ...(input.recordedAfter ? { gte: input.recordedAfter } : {}),
            ...(input.recordedBefore ? { lt: input.recordedBefore } : {}),
          },
        }
      : {}),
  }
  if (!query) return baseWhere
  return {
    ...baseWhere,
    OR: [
      { reference: { contains: query, mode: "insensitive" } },
      {
        recordedByUserId: {
          in: matchingActors.map((actor) => actor.id),
        },
      },
      {
        order: {
          is: {
            OR: [
              { customerEmail: { contains: query, mode: "insensitive" } },
              { customerName: { contains: query, mode: "insensitive" } },
              { customerPhone: { contains: query, mode: "insensitive" } },
              { orderNumber: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      },
    ],
  } satisfies Prisma.CommercialOrderPaymentWhereInput
}

/**
 * Exact received totals for a payments filter, one entry per order currency
 * with a by-method split. Amounts in different currencies are never added.
 */
export async function getCommercialPaymentTotalsForWhere(
  db: Pick<PrismaClient, "commercialOrder" | "commercialOrderPayment">,
  input: {
    createdByUserId?: string
    storeId?: string
    tenantId: string
    where: Prisma.CommercialOrderPaymentWhereInput
  },
) {
  const currencyRows = await db.commercialOrder.groupBy({
    by: ["currencyCode"],
    orderBy: { currencyCode: "asc" },
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      createdByUserId: input.createdByUserId,
    },
  })
  const currencies = await Promise.all(
    currencyRows.map(async ({ currencyCode }) => {
      const rows = await db.commercialOrderPayment.groupBy({
        by: ["method"],
        _count: { _all: true },
        _sum: { amountMinor: true },
        orderBy: { method: "asc" },
        where: { AND: [input.where, { order: { is: { currencyCode } } }] },
      })
      const byMethod = rows.map((row) => ({
        amountMinor: row._sum.amountMinor ?? 0,
        count: row._count._all,
        method: row.method,
      }))
      return {
        byMethod,
        currencyCode,
        totalAmountMinor: byMethod.reduce(
          (sum, row) => sum + row.amountMinor,
          0,
        ),
        totalCount: byMethod.reduce((sum, row) => sum + row.count, 0),
      }
    }),
  )
  const currencyTotals = currencies.filter((total) => total.totalCount > 0)
  return {
    currencyTotals,
    totalCount: currencyTotals.reduce(
      (count, total) => count + total.totalCount,
      0,
    ),
  }
}

/** Exact received totals for the payments list's scope, dates and methods. */
export async function getCommercialPaymentTotals(
  db: Pick<PrismaClient, "commercialOrder" | "commercialOrderPayment" | "user">,
  input: CommercialPaymentListFilter,
) {
  return getCommercialPaymentTotalsForWhere(db, {
    ...input,
    where: await commercialPaymentListWhere(db, input),
  })
}
