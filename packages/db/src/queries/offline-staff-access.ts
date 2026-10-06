import { CatalogError } from "./catalog-errors"
import type { DbClient } from "./types"

export class OfflineStaffAccessError extends CatalogError {
  constructor() {
    super(
      "INVALID_STOCK_OPERATION",
      "Current staff access does not permit this queued Order. Recreate it online after reviewing Store access.",
    )
  }
}

/** Replay and management approval must not reuse an old actor/role snapshot. */
export async function assertOfflineStaffActor(
  db: DbClient,
  input: { actorUserId: string; tenantId: string },
) {
  const [actor] = await db.$queryRaw<
    Array<{
      role: string
      status: string
      staffAccessMode: string
      isActive: boolean
    }>
  >`
  SELECT m."role", m."status", m."staffAccessMode", t."isActive"
  FROM "Membership" m JOIN "Tenant" t ON t."id" = m."tenantId"
  WHERE m."tenantId" = ${input.tenantId} AND m."userId" = ${input.actorUserId}
  FOR SHARE OF m
 `
  if (
    !actor ||
    !actor.isActive ||
    actor.status !== "ACTIVE" ||
    !["OWNER", "ADMIN", "MANAGER", "OPERATOR", "CASHIER"].includes(
      actor.role,
    ) ||
    (actor.staffAccessMode === "SCOPED" &&
      !["OWNER", "ADMIN"].includes(actor.role))
  )
    throw new OfflineStaffAccessError()
}
