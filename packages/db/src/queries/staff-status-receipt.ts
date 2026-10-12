import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { StaffStoreAccessError } from "./staff-store-access"

type Scope = { tenantId: string; actorUserId: string; eventId: string }

/** Exact original status event; directory identities/current membership are separate facts. */
export async function getStaffStatusReceiptInTransaction(
  tx: Prisma.TransactionClient,
  input: Scope,
) {
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${input.tenantId} AND "isActive"=true FOR SHARE`
  const [actor] = await tx.$queryRaw<Array<{ role: string; status: string }>>`
    SELECT m."role", m."status" FROM "Membership" m JOIN "Tenant" t
      ON t."id"=m."tenantId" AND t."isActive"=true
    WHERE m."tenantId"=${input.tenantId} AND m."userId"=${input.actorUserId} FOR SHARE OF m
  `
  if (
    !actor ||
    actor.status !== "ACTIVE" ||
    !["OWNER", "ADMIN"].includes(actor.role)
  )
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "Current Owner/Admin access is required for original staff status history.",
    )
  const event = await tx.retailOpsStaffLifecycleEvent.findFirst({
    where: {
      id: input.eventId,
      tenantId: input.tenantId,
      type: { in: ["SUSPENDED", "REACTIVATED"] },
    },
    select: {
      id: true,
      membershipId: true,
      staffUserId: true,
      actorUserId: true,
      happenedAt: true,
      type: true,
      reason: true,
      fromRole: true,
      toRole: true,
      fromStatus: true,
      toStatus: true,
    },
  })
  if (!event)
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "The original staff status record is unavailable in this business.",
    )
  const members = await tx.membership.findMany({
    where: {
      tenantId: input.tenantId,
      userId: {
        in: [
          event.staffUserId,
          ...(event.actorUserId ? [event.actorUserId] : []),
        ],
      },
    },
    select: {
      id: true,
      userId: true,
      role: true,
      status: true,
      staffAccessRevision: true,
      user: { select: { name: true, displayName: true, email: true } },
    },
  })
  const subject = members.find(
    (row) => row.userId === event.staffUserId && row.id === event.membershipId,
  )
  const recordedActor = members.find((row) => row.userId === event.actorUserId)
  const identity = (member: typeof subject) =>
    member
      ? {
          name: member.user.displayName?.trim() || member.user.name,
          email: member.user.email,
          coverage: "current_directory" as const,
        }
      : { name: null, email: null, coverage: "unavailable" as const }
  return {
    eventId: event.id,
    membershipId: event.membershipId,
    eventType: event.type,
    happenedAt: event.happenedAt.toISOString(),
    reason: event.reason,
    originalActorUserId: event.actorUserId,
    before: { role: event.fromRole, status: event.fromStatus },
    after: { role: event.toRole, status: event.toStatus },
    subject: identity(subject),
    actor: identity(recordedActor),
    currentMembership: subject
      ? {
          membershipId: subject.id,
          role: subject.role,
          status: subject.status,
          accessRevision: subject.staffAccessRevision,
        }
      : null,
    scope: "business_membership" as const,
    asOf: new Date().toISOString(),
    detail:
      "Original before/after, actor reference, reason and time are saved lifecycle facts. Display names and contacts come from the current same-business directory; historical identity snapshots and original Store grants are not recorded here. Current membership is separate from the original outcome.",
  }
}
export function getStaffStatusReceipt(db: PrismaClient, input: Scope) {
  return db.$transaction(
    (tx) => getStaffStatusReceiptInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
      isolationLevel: "RepeatableRead",
    },
  )
}
export type StaffStatusReceiptRecord = Awaited<
  ReturnType<typeof getStaffStatusReceiptInTransaction>
>
