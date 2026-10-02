import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"

export type FinanceActor = { tenantId: string; actorUserId: string }

export async function assertFinanceManager(
  tx: Prisma.TransactionClient,
  input: FinanceActor,
) {
  // Retain the membership lock until commit so a concurrent revocation cannot
  // pass between the permission decision and a financial effect.
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId" = ${input.tenantId} AND "userId" = ${input.actorUserId} FOR SHARE`
  const membership = await tx.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: {
      tenant: {
        select: {
          id: true,
          currencyCode: true,
          timezone: true,
          isActive: true,
        },
      },
    },
  })
  if (!membership?.tenant.isActive) {
    throw new FinanceError(
      "FORBIDDEN",
      "Only active business Owners and Admins can manage finance.",
    )
  }
  return membership.tenant
}

export async function lockFinanceBook(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string },
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "FinanceBook" WHERE id = ${input.bookId} AND "tenantId" = ${input.tenantId} FOR UPDATE`
  await assertFinanceManager(tx, input)
  const row = rows[0]
  if (!row) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  const book = await tx.financeBook.findUniqueOrThrow({
    where: { id: row.id },
  })
  return book
}
