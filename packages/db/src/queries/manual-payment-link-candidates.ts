import { ManualPaymentError } from "@ewatrade/utils/manual-payments"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { effectiveCommercialAmountPaid } from "./commercial-payments"
import { lockCommerceFinancialContext } from "./customer-ledger/commerce-locks"

export async function lockManualPaymentLinkOrdersInTransaction(
  tx: Prisma.TransactionClient,
  tenantId: string,
  rows: Array<{ id: string; currencyCode: string; customerId: string | null }>,
) {
  for (const row of [...rows].sort((a, b) =>
    (a.customerId ?? "").localeCompare(b.customerId ?? ""),
  ))
    await lockCommerceFinancialContext(tx, {
      tenantId,
      currencyCode: row.currencyCode,
      customerId: row.customerId,
    })
  const ids = rows.map((row) => row.id).sort()
  await tx.$queryRaw`SELECT id FROM "CommercialOrder" WHERE "tenantId"=${tenantId} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`
}

export async function manualPaymentLinkCandidates(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    tenantId: string
    scope: Prisma.CommercialOrderWhereInput
    period: "today" | "all"
    query?: string
    beforeId?: string
  },
) {
  const tenant = await db.tenant.findFirst({
    where: { id: input.tenantId, isActive: true },
    select: { timezone: true },
  })
  if (!tenant) throw new ManualPaymentError("NOT_FOUND", "Business not found.")
  const bounds =
    input.period === "today"
      ? (
          await db.$queryRaw<Array<{ from: Date; before: Date }>>`
    SELECT (date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE ${tenant.timezone}) AT TIME ZONE ${tenant.timezone}) AS "from",
    ((date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE ${tenant.timezone}) + INTERVAL '1 day') AT TIME ZONE ${tenant.timezone}) AS "before"
  `
        )[0]
      : null
  const query = input.query?.trim()
  const rows = await db.commercialOrder.findMany({
    where: {
      AND: [
        input.scope,
        {
          status: { notIn: ["DRAFT", "CANCELLED", "REFUNDED"] },
          paymentStatus: { not: "PAID" },
          currencyCode: "NGN",
        },
        ...(bounds
          ? [{ createdAt: { gte: bounds.from, lt: bounds.before } }]
          : []),
        ...(input.beforeId ? [{ id: { lt: input.beforeId } }] : []),
        ...(query
          ? [
              {
                OR: [
                  {
                    orderNumber: {
                      contains: query,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    customerName: {
                      contains: query,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    serviceJobs: {
                      some: {
                        OR: [
                          { id: query },
                          {
                            clientJobId: {
                              equals: query,
                              mode: "insensitive" as const,
                            },
                          },
                        ],
                      },
                    },
                  },
                  {
                    lines: {
                      some: {
                        kind: "SERVICE" as const,
                        snapshot: {
                          offeringName: {
                            contains: query,
                            mode: "insensitive" as const,
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    include: {
      _count: { select: { payments: true } },
      serviceJobs: { select: { id: true, clientJobId: true }, take: 5 },
    },
    orderBy: { id: "desc" },
    take: 21,
  })
  const items = rows
    .slice(0, 20)
    .map((order) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      serviceJobs: order.serviceJobs,
      balanceMinor: Math.max(
        0,
        order.totalMinor -
          effectiveCommercialAmountPaid({
            ...order,
            paymentCount: order._count.payments,
          }),
      ),
      currencyCode: order.currencyCode,
      createdAt: order.createdAt,
    }))
    .filter((row) => row.balanceMinor > 0)
  const book = await db.financeBook.findFirst({
    where: { tenantId: input.tenantId, currencyCode: "NGN" },
    select: { id: true },
  })
  const accounts = book
    ? await db.financeAccount.findMany({
        where: {
          bookId: book.id,
          kind: "ASSET",
          purpose: "BANK",
          archivedAt: null,
          paymentsPausedAt: null,
          bankName: { not: null },
          bankAccountNumber: { not: null },
          bankAccountHolder: { not: null },
          OR: [
            { paymentMethods: { isEmpty: true } },
            { paymentMethods: { has: "BANK_TRANSFER" } },
          ],
        },
        select: {
          id: true,
          name: true,
          bankName: true,
          bankAccountNumber: true,
        },
        orderBy: { code: "asc" },
        take: 50,
      })
    : []
  return {
    items,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      bankName: account.bankName,
      accountSuffix: account.bankAccountNumber?.slice(-4) ?? "",
    })),
    nextCursor: rows.length > 20 ? (rows[19]?.id ?? null) : null,
    period: input.period,
    timezone: tenant.timezone,
    from: bounds?.from ?? null,
    before: bounds?.before ?? null,
    dateBasis: "order_created_at" as const,
  }
}
