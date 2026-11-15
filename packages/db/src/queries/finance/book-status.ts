import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { FinanceError } from "./rules"

type BookStatusRow = {
  isActive: boolean
  role: string
  status: string
  bookId: string | null
  currencyCode: string | null
  timezone: string | null
  startsAt: Date | null
}

/**
 * Whether the business's current-currency Book exists, and the few fields a
 * page needs to render around it (id, currency, time zone, start date). One
 * statement and no transaction or lock: it records nothing, and every money
 * read or command still admits the actor under its own Membership lock.
 */
export async function getFinanceBookStatus(
  db: Pick<PrismaClient, "$queryRaw">,
  input: FinanceActor,
) {
  const rows = await db.$queryRaw<BookStatusRow[]>`
    SELECT t."isActive", m.role::text AS role, m.status::text AS status,
      b.id AS "bookId", b."currencyCode", b.timezone, b."startsAt"
    FROM "Membership" m JOIN "Tenant" t ON t.id = m."tenantId"
    LEFT JOIN "FinanceBook" b
      ON b."tenantId" = t.id AND b."currencyCode" = t."currencyCode"
    WHERE m."tenantId" = ${input.tenantId} AND m."userId" = ${input.actorUserId}
  `
  const row = rows[0]
  if (
    !row?.isActive ||
    row.status !== "ACTIVE" ||
    !["OWNER", "ADMIN"].includes(row.role)
  )
    throw new FinanceError(
      "FORBIDDEN",
      "Only active business Owners and Admins can manage finance.",
    )
  if (!row.bookId || !row.currencyCode || !row.timezone || !row.startsAt)
    return null
  return {
    id: row.bookId,
    currencyCode: row.currencyCode,
    timezone: row.timezone,
    startsAt: row.startsAt,
  }
}
