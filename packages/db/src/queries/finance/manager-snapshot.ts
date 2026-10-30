import type { Membership, Tenant } from "../../../generated/prisma/client"
import { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import type { FinanceReadBookScope } from "./read-book-scope"
import { FinanceError } from "./rules"

type ManagerSnapshot = Pick<
  Tenant,
  "id" | "currencyCode" | "timezone" | "isActive"
> &
  Pick<Membership, "role" | "status">

function requireFinanceManagerSnapshot(row: ManagerSnapshot | undefined) {
  if (
    !row?.isActive ||
    row.status !== "ACTIVE" ||
    !["OWNER", "ADMIN"].includes(row.role)
  )
    throw new FinanceError(
      "FORBIDDEN",
      "Only active business Owners and Admins can manage finance.",
    )
  return {
    id: row.id,
    currencyCode: row.currencyCode,
    timezone: row.timezone,
    isActive: row.isActive,
  }
}

/** Only for readers that own RepeatableRead; Book/commands keep the post-lock read. */
export async function assertFinanceManagerSnapshot(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: FinanceActor,
) {
  const rows = await tx.$queryRaw<ManagerSnapshot[]>`
    SELECT t.id,t."currencyCode",t.timezone,t."isActive",
      m.role::text AS role,m.status::text AS status
    FROM "Membership" m JOIN "Tenant" t ON t.id=m."tenantId"
    WHERE m."tenantId"=${input.tenantId} AND m."userId"=${input.actorUserId}
    FOR SHARE OF m
  `
  return requireFinanceManagerSnapshot(rows[0])
}

type ManagerBookSnapshot = ManagerSnapshot & {
  bookId: string | null
  bookCurrencyCode: string | null
  bookLastSequence: bigint | null
  bookStartsAt: Date | null
}

/** Admission and Book share the caller's existing RepeatableRead snapshot and Membership lock. */
export async function getFinanceManagerBookSnapshot(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: FinanceActor & FinanceReadBookScope,
) {
  const bookScope =
    "bookId" in input && !("currentCurrency" in input)
      ? Prisma.sql`b.id=${input.bookId}`
      : !("bookId" in input) && "currentCurrency" in input
        ? Prisma.sql`b."currencyCode"=t."currencyCode" AND t."currencyCode"=${input.currentCurrency}`
        : Prisma.sql`FALSE`
  const rows = await tx.$queryRaw<ManagerBookSnapshot[]>(Prisma.sql`
    SELECT t.id,t."currencyCode",t.timezone,t."isActive",
      m.role::text AS role,m.status::text AS status,
      b.id AS "bookId",b."currencyCode" AS "bookCurrencyCode",
      b."lastSequence" AS "bookLastSequence",b."startsAt" AS "bookStartsAt"
    FROM "Membership" m JOIN "Tenant" t ON t.id=m."tenantId"
    LEFT JOIN "FinanceBook" b ON b."tenantId"=t.id AND ${bookScope}
    WHERE m."tenantId"=${input.tenantId} AND m."userId"=${input.actorUserId}
    FOR SHARE OF m
  `)
  const row = rows[0]
  requireFinanceManagerSnapshot(row)
  if (
    !row ||
    row.bookId === null ||
    row.bookCurrencyCode === null ||
    row.bookLastSequence === null ||
    row.bookStartsAt === null
  )
    throw new FinanceError("NOT_FOUND", "Financial book not found.")
  return {
    id: row.bookId,
    currencyCode: row.bookCurrencyCode,
    lastSequence: row.bookLastSequence,
    startsAt: row.bookStartsAt,
  }
}
