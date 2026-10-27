import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { projectStaffAccessSnapshot } from "./staff-access-history-snapshot"
import { StaffDirectoryError } from "./staff-directory"
import {
  type StaffHistoryPageInput,
  accessTypes,
  afterPosition,
  compareEvents,
  cursorPosition,
  keyFor,
  lifecycleTypes,
  staffHistoryPageInput,
} from "./staff-history-input"
export {
  staffHistoryPageInput,
  staffHistoryFiltersInput,
  type StaffHistoryPageInput,
} from "./staff-history-input"
export { projectStaffAccessSnapshot } from "./staff-access-history-snapshot"

type Identity = {
  coverage: "available" | "historical_profile"
  membershipId: string | null
  userId: string
  name: string
  email: string
}
const hiddenIdentity = {
  coverage: "unavailable" as const,
  membershipId: null,
  userId: null,
  name: null,
  email: null,
}

/** Caller owns the transaction. Also used by rollback evidence without nested transactions. */
export async function listStaffHistoryPageInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffHistoryPageInput,
) {
  const parsed = staffHistoryPageInput.parse({
    membershipId: input.membershipId,
    actorMembershipId: input.actorMembershipId,
    storeId: input.storeId,
    stream: input.stream,
    eventType: input.eventType,
    from: input.from,
    to: input.to,
    cursor: input.cursor,
    limit: input.limit,
  })
  const key = keyFor({ ...input, ...parsed })
  const after = cursorPosition(parsed.cursor, key)
  const actor = await tx.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    select: { role: true },
  })
  if (!actor || !["OWNER", "ADMIN"].includes(actor.role))
    throw new StaffDirectoryError(
      "FORBIDDEN",
      "Current Owner/Admin authority is required for staff access history.",
    )
  const selected = await Promise.all(
    [parsed.membershipId, parsed.actorMembershipId].map(
      async (membershipId) => {
        if (!membershipId) return null
        const member = await tx.membership.findFirst({
          where: { id: membershipId, tenantId: input.tenantId },
          select: { id: true, userId: true },
        })
        if (!member)
          throw new StaffDirectoryError(
            "NOT_FOUND",
            "Staff membership not found for this business.",
          )
        return member
      },
    ),
  )
  if (
    parsed.storeId &&
    !(await tx.store.findFirst({
      where: { id: parsed.storeId, tenantId: input.tenantId },
      select: { id: true },
    }))
  )
    throw new StaffDirectoryError(
      "NOT_FOUND",
      "Historical Store not found for this business.",
    )
  const [tables] = await tx.$queryRaw<
    Array<{ lifecycle: boolean; access: boolean; profiles: boolean }>
  >`SELECT
    (SELECT count(*)=12 FROM pg_attribute WHERE attrelid=to_regclass('"RetailOpsStaffLifecycleEvent"') AND NOT attisdropped AND attname=ANY(ARRAY['id','tenantId','membershipId','staffUserId','actorUserId','type','fromStatus','toStatus','fromRole','toRole','happenedAt','reason'])) AS lifecycle,
    (SELECT count(*)=9 FROM pg_attribute WHERE attrelid=to_regclass('"StaffAccessAuditEvent"') AND NOT attisdropped AND attname=ANY(ARRAY['id','tenantId','membershipId','actorUserId','operation','revision','before','after','createdAt'])) AS access,
    (SELECT count(*)=4 FROM pg_attribute WHERE attrelid=to_regclass('"RetailOpsStaffProfile"') AND NOT attisdropped AND attname=ANY(ARRAY['tenantId','userId','displayName','id'])) AS profiles`
  if (!tables) throw new Error("Staff history table metadata is unavailable.")
  const wantsLifecycle =
    !parsed.storeId &&
    parsed.stream !== "STORE_ACCESS" &&
    (!parsed.eventType ||
      lifecycleTypes.includes(
        parsed.eventType as (typeof lifecycleTypes)[number],
      ))
  const wantsAccess =
    parsed.stream !== "LIFECYCLE" &&
    (!parsed.eventType ||
      accessTypes.includes(parsed.eventType as (typeof accessTypes)[number]))
  const time = {
    ...(parsed.from ? { gte: new Date(parsed.from) } : {}),
    ...(parsed.to ? { lt: new Date(parsed.to) } : {}),
  }
  const lifecycleWhere: Prisma.RetailOpsStaffLifecycleEventWhereInput = {
    tenantId: input.tenantId,
    ...(selected[0]
      ? {
          OR: [
            { membershipId: selected[0].id },
            { membershipId: null, staffUserId: selected[0].userId },
          ],
        }
      : {}),
    ...(selected[1] ? { actorUserId: selected[1].userId } : {}),
    ...(parsed.eventType
      ? { type: parsed.eventType as (typeof lifecycleTypes)[number] }
      : {}),
    happenedAt: time,
  }
  const operation =
    parsed.eventType === "STORE_ACCESS_CONFIRMED"
      ? "scoped_access_confirmed"
      : parsed.eventType === "STORE_ACCESS_CHANGED"
        ? "access_changed"
        : undefined
  const accessWhere: Prisma.StaffAccessAuditEventWhereInput = {
    tenantId: input.tenantId,
    membershipId: selected[0]?.id,
    actorUserId: selected[1]?.userId,
    operation:
      parsed.eventType === "OTHER_STORE_ACCESS_CHANGE"
        ? { notIn: ["scoped_access_confirmed", "access_changed"] }
        : operation,
    createdAt: time,
    ...(parsed.storeId
      ? {
          OR: [
            {
              before: {
                path: ["assignments"],
                array_contains: [{ storeId: parsed.storeId }],
              },
            },
            {
              after: {
                path: ["assignments"],
                array_contains: [{ storeId: parsed.storeId }],
              },
            },
            { before: { path: ["defaultStoreId"], equals: parsed.storeId } },
            { after: { path: ["defaultStoreId"], equals: parsed.storeId } },
          ],
        }
      : {}),
  }
  const [lifecycle, access, lifecycleCount, accessCount] = await Promise.all([
    wantsLifecycle && tables.lifecycle
      ? tx.retailOpsStaffLifecycleEvent.findMany({
          where: {
            AND: [
              lifecycleWhere,
              afterPosition("LIFECYCLE", after, "happenedAt"),
            ],
          },
          orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
          take: parsed.limit + 1,
          select: {
            id: true,
            membershipId: true,
            staffUserId: true,
            actorUserId: true,
            type: true,
            happenedAt: true,
            reason: true,
            fromRole: true,
            toRole: true,
            fromStatus: true,
            toStatus: true,
          },
        })
      : [],
    wantsAccess && tables.access
      ? tx.staffAccessAuditEvent.findMany({
          where: {
            AND: [
              accessWhere,
              afterPosition("STORE_ACCESS", after, "createdAt"),
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: parsed.limit + 1,
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
      : [],
    wantsLifecycle && tables.lifecycle
      ? tx.retailOpsStaffLifecycleEvent.count({ where: lifecycleWhere })
      : 0,
    wantsAccess && tables.access
      ? tx.staffAccessAuditEvent.count({ where: accessWhere })
      : 0,
  ])
  const events = [
    ...lifecycle.map((row) => ({
      id: row.id,
      at: row.happenedAt,
      stream: "LIFECYCLE" as const,
      row,
    })),
    ...access.map((row) => ({
      id: row.id,
      at: row.createdAt,
      stream: "STORE_ACCESS" as const,
      row,
    })),
  ]
    .sort(compareEvents)
    .slice(0, parsed.limit + 1)
  const page = events.slice(0, parsed.limit)
  const membershipIds = [
    ...new Set(
      page
        .map((e) => e.row.membershipId)
        .filter((v): v is string => v !== null),
    ),
  ]
  const userIds = [
    ...new Set(
      page
        .flatMap((e) => [
          e.row.actorUserId,
          ...(e.stream === "LIFECYCLE" ? [e.row.staffUserId] : []),
        ])
        .filter((v): v is string => v !== null),
    ),
  ]
  const [members, profiles, stores] = await Promise.all([
    tx.membership.findMany({
      where: {
        tenantId: input.tenantId,
        OR: [{ id: { in: membershipIds } }, { userId: { in: userIds } }],
      },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true, displayName: true, email: true } },
      },
    }),
    tables.profiles
      ? tx.retailOpsStaffProfile.findMany({
          where: { tenantId: input.tenantId, userId: { in: userIds } },
          select: {
            userId: true,
            displayName: true,
            user: { select: { name: true, email: true } },
          },
        })
      : [],
    page.some((e) => e.stream === "STORE_ACCESS")
      ? tx.store.findMany({
          where: { tenantId: input.tenantId },
          select: { id: true, name: true },
        })
      : [],
  ])
  const byMembership = new Map<string, Identity>()
  const byUser = new Map<string, Identity>()
  for (const m of members) {
    const identity: Identity = {
      coverage: "available",
      membershipId: m.id,
      userId: m.userId,
      name: m.user.displayName || m.user.name,
      email: m.user.email,
    }
    byMembership.set(m.id, identity)
    byUser.set(m.userId, identity)
  }
  for (const p of profiles)
    if (!byUser.has(p.userId))
      byUser.set(p.userId, {
        coverage: "historical_profile",
        membershipId: null,
        userId: p.userId,
        name: p.displayName || p.user.name,
        email: p.user.email,
      })
  const storeNames = new Map(
    stores.map((store) => [store.id, store.name] as const),
  )
  const data = page.map((event) => {
    const subject =
      (event.row.membershipId
        ? byMembership.get(event.row.membershipId)
        : undefined) ??
      (event.stream === "LIFECYCLE"
        ? byUser.get(event.row.staffUserId)
        : undefined) ??
      hiddenIdentity
    const actor = event.row.actorUserId
      ? (byUser.get(event.row.actorUserId) ?? hiddenIdentity)
      : hiddenIdentity
    if (event.stream === "LIFECYCLE")
      return {
        id: event.id,
        at: event.at.toISOString(),
        stream: event.stream,
        eventType: event.row.type,
        source: "RetailOpsStaffLifecycleEvent" as const,
        subject,
        actor,
        reason: event.row.reason,
        before: { role: event.row.fromRole, status: event.row.fromStatus },
        after: { role: event.row.toRole, status: event.row.toStatus },
      }
    return {
      id: event.id,
      at: event.at.toISOString(),
      stream: event.stream,
      eventType:
        event.row.operation === "scoped_access_confirmed"
          ? ("STORE_ACCESS_CONFIRMED" as const)
          : event.row.operation === "access_changed"
            ? ("STORE_ACCESS_CHANGED" as const)
            : ("OTHER_STORE_ACCESS_CHANGE" as const),
      source: "StaffAccessAuditEvent" as const,
      subject,
      actor,
      revision: event.row.revision,
      before: projectStaffAccessSnapshot(event.row.before, storeNames),
      after: projectStaffAccessSnapshot(event.row.after, storeNames),
    }
  })
  const last = page.at(-1)
  const incompleteTables =
    (wantsLifecycle && !tables.lifecycle) || (wantsAccess && !tables.access)
  return {
    data,
    total: incompleteTables ? null : lifecycleCount + accessCount,
    knownMatchingEvents: lifecycleCount + accessCount,
    nextCursor:
      events.length > parsed.limit && last
        ? Buffer.from(
            JSON.stringify({
              id: last.id,
              stream: last.stream,
              at: last.at.toISOString(),
              filterKey: key,
            }),
          ).toString("base64url")
        : null,
    asOf: new Date().toISOString(),
    scope: parsed.storeId
      ? ("recorded_store_access" as const)
      : ("tenant_staff_history" as const),
    coverage: {
      history: "partial" as const,
      lifecycle: !wantsLifecycle
        ? ("not_requested" as const)
        : tables.lifecycle
          ? ("available" as const)
          : ("unavailable" as const),
      access: !wantsAccess
        ? ("not_requested" as const)
        : tables.access
          ? ("available" as const)
          : ("unavailable" as const),
      identities: data.some(
        (e) =>
          e.actor.coverage === "unavailable" ||
          e.subject.coverage === "unavailable",
      )
        ? ("partial" as const)
        : ("available" as const),
      detail:
        "Only recorded events are shown. Legacy writes may have no durable events; current status does not reconstruct history. Store filters exclude business membership events. Pages are live request snapshots.",
    },
  }
}

export async function listStaffHistoryPage(
  db: PrismaClient,
  input: StaffHistoryPageInput,
) {
  return db.$transaction((tx) => listStaffHistoryPageInTransaction(tx, input), {
    isolationLevel: "RepeatableRead",
    maxWait: 10_000,
    timeout: 30_000,
  })
}
