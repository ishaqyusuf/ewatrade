import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { OrderStatus, PaymentStatus } from "../../generated/prisma/enums"

/** Filters shared by the Orders list and its totals. */
export type CommercialOrderListFilter = {
  createdByUserId?: string
  createdAfter?: Date
  createdBefore?: Date
  paymentStatuses?: PaymentStatus[]
  query?: string
  queryMode?: "all" | "customer"
  statuses?: OrderStatus[]
  storeId?: string
  tenantId: string
}

/**
 * Older orders marked paid without payment rows count as fully paid, the same
 * rule as `effectiveCommercialAmountPaid`.
 */
export const legacyPaidWhere = {
  amountPaidMinor: 0,
  paymentStatus: PaymentStatus.PAID,
  payments: { none: {} },
} satisfies Prisma.CommercialOrderWhereInput

/**
 * Orders with money still due, Home's "unpaid" rule: paid below total, not
 * legacy-paid, and not cancelled or refunded.
 */
export function commercialOrderOwingWhere(
  db: Pick<PrismaClient, "commercialOrder">,
): Prisma.CommercialOrderWhereInput {
  return {
    AND: [
      { amountPaidMinor: { lt: db.commercialOrder.fields.totalMinor } },
      { NOT: legacyPaidWhere },
      { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } },
    ],
  }
}

/**
 * `baseWhere` is scope, dates and statuses; `where` adds the search, which
 * matches order number, customer contact and line item names.
 */
export function commercialOrderListWhere(input: CommercialOrderListFilter) {
  const normalizedQuery = input.query?.trim()
  const baseWhere: Prisma.CommercialOrderWhereInput = {
    createdByUserId: input.createdByUserId,
    createdAt:
      input.createdAfter || input.createdBefore
        ? {
            ...(input.createdAfter ? { gte: input.createdAfter } : {}),
            ...(input.createdBefore ? { lt: input.createdBefore } : {}),
          }
        : undefined,
    paymentStatus: input.paymentStatuses?.length
      ? { in: input.paymentStatuses }
      : undefined,
    status: input.statuses?.length ? { in: input.statuses } : undefined,
    storeId: input.storeId,
    tenantId: input.tenantId,
  }
  const where: Prisma.CommercialOrderWhereInput = normalizedQuery
    ? {
        ...baseWhere,
        OR: [
          ...(input.queryMode === "customer"
            ? []
            : [
                {
                  orderNumber: {
                    contains: normalizedQuery,
                    mode: "insensitive" as const,
                  },
                },
              ]),
          { customerName: { contains: normalizedQuery, mode: "insensitive" } },
          {
            customerPhone: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          {
            customerEmail: {
              contains: normalizedQuery,
              mode: "insensitive",
            },
          },
          ...(input.queryMode === "customer"
            ? []
            : [
                {
                  lines: {
                    some: {
                      snapshot: {
                        is: {
                          catalogItemName: {
                            contains: normalizedQuery,
                            mode: "insensitive" as const,
                          },
                        },
                      },
                    },
                  },
                },
              ]),
        ],
      }
    : baseWhere
  return { baseWhere, where }
}
