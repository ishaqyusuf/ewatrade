import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { projectStaffAccessSnapshot } from "./staff-access-history-snapshot"
import {
  assertStaffStoreAccessAuthority,
  StaffStoreAccessError,
} from "./staff-store-access"

type Scope = { tenantId: string; actorUserId: string; eventId: string }

function storeIds(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const ids: string[] = []
  if (typeof value.defaultStoreId === "string") ids.push(value.defaultStoreId)
  if (Array.isArray(value.assignments) && value.assignments.length <= 100)
    for (const row of value.assignments)
      if (
        row &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        typeof row.storeId === "string"
      )
        ids.push(row.storeId)
  return ids.filter((id) => id.length > 0 && id.length <= 160)
}

/** Original canonical access event; current directory labels are separate facts. */
export async function getStaffAccessReceiptInTransaction(
  tx: Prisma.TransactionClient,
  input: Scope,
) {
  const [tenant] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Tenant" WHERE "id"=${input.tenantId} AND "isActive"=true FOR SHARE
  `
  if (!tenant)
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "This business is unavailable.",
    )
  await assertStaffStoreAccessAuthority(tx, input)
  const event = await tx.staffAccessAuditEvent.findFirst({
    where: {
      id: input.eventId,
      tenantId: input.tenantId,
      operation: { in: ["scoped_access_confirmed", "access_changed"] },
    },
    select: {
      id: true,
      membershipId: true,
      actorUserId: true,
      operation: true,
      revision: true,
      before: true,
      after: true,
      createdAt: true,
    },
  })
  if (!event)
    throw new StaffStoreAccessError(
      "FORBIDDEN",
      "The original access record is unavailable in this business.",
    )
  const ids = [
    ...new Set([...storeIds(event.before), ...storeIds(event.after)]),
  ]
  const [stores, members] = await Promise.all([
    tx.store.findMany({
      where: { tenantId: input.tenantId, id: { in: ids } },
      select: { id: true, name: true },
    }),
    tx.membership.findMany({
      where: {
        tenantId: input.tenantId,
        OR: [{ id: event.membershipId }, { userId: event.actorUserId }],
      },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        staffAccessMode: true,
        staffAccessRevision: true,
        catalogEditor: true,
        retailOpsStaffProfile: { select: { defaultStoreId: true } },
        user: { select: { name: true, displayName: true, email: true } },
      },
    }),
  ])
  const subject = members.find((row) => row.id === event.membershipId)
  const actor = members.find((row) => row.userId === event.actorUserId)
  const identity = (member: typeof subject) =>
    member
      ? {
          name: member.user.displayName?.trim() || member.user.name,
          email: member.user.email,
          coverage: "current_directory" as const,
        }
      : { name: null, email: null, coverage: "unavailable" as const }
  const labels = new Map(stores.map((store) => [store.id, store.name]))
  return {
    eventId: event.id,
    membershipId: event.membershipId,
    operation: event.operation,
    revision: event.revision,
    happenedAt: event.createdAt.toISOString(),
    originalActorUserId: event.actorUserId,
    source: "StaffAccessAuditEvent" as const,
    before: projectStaffAccessSnapshot(event.before, labels),
    after: projectStaffAccessSnapshot(event.after, labels),
    subject: identity(subject),
    actor: identity(actor),
    currentMembership: subject
      ? {
          membershipId: subject.id,
          role: subject.role,
          status: subject.status,
          accessMode: subject.staffAccessMode,
          accessRevision: subject.staffAccessRevision,
          catalogEditor: subject.catalogEditor,
          defaultStoreId: subject.retailOpsStaffProfile?.defaultStoreId ?? null,
        }
      : null,
    provenance: {
      reason: "not_recorded" as const,
      handover: "not_recorded" as const,
      historicalNames: "not_recorded" as const,
    },
    scope: "business_membership" as const,
    asOf: new Date().toISOString(),
    detail:
      "Original access snapshots, revision, actor reference and time are saved audit facts. Display labels are current same-business directory labels. Reason and service handover are not recorded; current membership is separate from the original outcome.",
  }
}

export function getStaffAccessReceipt(db: PrismaClient, input: Scope) {
  return db.$transaction(
    (tx) => getStaffAccessReceiptInTransaction(tx, input),
    {
      maxWait: 10_000,
      timeout: 30_000,
      isolationLevel: "RepeatableRead",
    },
  )
}
export type StaffAccessReceiptRecord = Awaited<
  ReturnType<typeof getStaffAccessReceiptInTransaction>
>
