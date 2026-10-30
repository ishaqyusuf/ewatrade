import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { FinanceError } from "./rules"

/** Currency is only a lookup hint; authority and current currency are read after the lock. */
export async function readFinanceBookWithCurrencyHint(
  tx: Prisma.TransactionClient,
  input: FinanceActor,
  currencyHint: string,
) {
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId" = ${input.tenantId} AND "userId" = ${input.actorUserId} FOR SHARE`
  const membership = await tx.membership.findFirst({
    relationLoadStrategy: "join",
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
      tenant: { isActive: true },
    },
    select: {
      tenant: {
        select: {
          id: true,
          currencyCode: true,
          isActive: true,
          financeBooks: {
            where: {
              currencyCode: currencyHint,
              tenant: { currencyCode: currencyHint },
            },
            take: 1,
            include: { accounts: { orderBy: { code: "asc" } } },
          },
        },
      },
    },
  })
  if (!membership?.tenant.isActive)
    throw new FinanceError(
      "FORBIDDEN",
      "Only active business Owners and Admins can manage finance.",
    )
  const tenant = membership.tenant
  if (tenant.currencyCode !== currencyHint)
    return tx.financeBook.findUnique({
      where: {
        tenantId_currencyCode: {
          tenantId: input.tenantId,
          currencyCode: tenant.currencyCode,
        },
      },
      include: { accounts: { orderBy: { code: "asc" } } },
    })
  return tenant.financeBooks[0] ?? null
}
