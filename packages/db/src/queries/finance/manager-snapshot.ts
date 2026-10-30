import type {
  Membership,
  Prisma,
  Tenant,
} from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { FinanceError } from "./rules"

type ManagerSnapshot = Pick<
  Tenant,
  "id" | "currencyCode" | "timezone" | "isActive"
> &
  Pick<Membership, "role" | "status">

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
  return {
    id: row.id,
    currencyCode: row.currencyCode,
    timezone: row.timezone,
    isActive: row.isActive,
  }
}
