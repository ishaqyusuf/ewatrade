import { createHash } from "node:crypto"
import {
  type BusinessActivityDetail,
  type BusinessActivityListInput,
  type BusinessActivityPage,
  type BusinessActivityView,
  type BusinessEventType,
  businessActivityListInput,
  businessActivityOriginSchema,
  businessActivityViewSchema,
  hasBusinessEventHandler,
  implementedBusinessEventHandlers,
  presentBusinessEventPayload,
} from "@ewatrade/notifications/business-events"
import { z } from "zod"
import {
  type BusinessActivityEvent,
  Prisma,
  type PrismaClient,
} from "../../../generated/prisma/client"
import { BusinessActivityError } from "./errors"
import {
  BUSINESS_ACTIVITY_READ_VERSION,
  businessActivitySources,
  presentLegacyBusinessActivity,
} from "./legacy"
import {
  type BusinessActivityScope,
  type BusinessActivityViewer,
  businessActivityScope,
  businessActivityScopeSql,
} from "./scope"

const position = z
  .object({
    at: z.iso.datetime(),
    id: z.string().min(1).max(160),
    snapshotAt: z.iso.datetime(),
    filterKey: z.string().length(64),
  })
  .strict()
export type ProjectedBusinessActivityRow = BusinessActivityEvent & {
  actorName: string | null
  actorDisplayName: string | null
  availableActorId: string | null
  storeName: string | null
  currentOrderStatus: string | null
  currentOrderId: string | null
  currentSubjectId: string | null
  currentInvitationCommandId: string | null
  currentMovementId: string | null
}

export function decodeBusinessActivityCursor(
  cursor: string,
  filterKey: string,
  now: Date,
) {
  try {
    const parsed = position.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    )
    if (
      parsed.filterKey !== filterKey ||
      Date.parse(parsed.snapshotAt) > now.getTime()
    )
      throw Error("Invalid cursor")
    return parsed
  } catch {
    throw new BusinessActivityError(
      "BAD_REQUEST",
      "Refresh Activity after changing filters or access.",
    )
  }
}

export const businessActivityJoins = Prisma.sql`
 LEFT JOIN "Membership" am ON am.id=e."actorMembershipId" AND am."tenantId"=e."tenantId"
 LEFT JOIN "User" au ON au.id=am."userId"
 LEFT JOIN "Store" s ON s.id=e."storeId" AND s."tenantId"=e."tenantId"
 LEFT JOIN "CommercialOrder" co ON co.id=e.payload->>'orderId' AND co."tenantId"=e."tenantId"
 LEFT JOIN "Membership" sm ON sm.id=e."subjectMembershipId" AND sm."tenantId"=e."tenantId"
 LEFT JOIN "StaffInvitationCommand" ic ON ic.id=e.payload->>'commandId' AND ic."tenantId"=e."tenantId"
 LEFT JOIN "FinanceJournalEntry" fm ON fm.id=e.payload->>'movementId' AND fm."bookId"=e."financeBookId"
 AND fm."reversalOfId" IS NULL
 AND fm."sourceKind" IN ('TRANSFER','OWNER_CONTRIBUTION','OWNER_WITHDRAWAL')`
export const businessActivityRowSelect = Prisma.sql`e.*, au.name AS "actorName", au."displayName" AS "actorDisplayName",
 am.id AS "availableActorId", s.name AS "storeName", co.status::text AS "currentOrderStatus", co.id AS "currentOrderId",
 sm.id AS "currentSubjectId", ic.id AS "currentInvitationCommandId", fm.id AS "currentMovementId"`

export function projectBusinessActivity(
  row: ProjectedBusinessActivityRow,
): BusinessActivityView {
  const type = row.type as BusinessEventType
  if (!hasBusinessEventHandler(type))
    throw new BusinessActivityError(
      "BAD_REQUEST",
      "This recorded event version is unavailable.",
    )
  const actorName = (row.actorDisplayName || row.actorName || "")
    .trim()
    .slice(0, 240)
  const system = row.actorKind === "system"
  const actor = system
    ? {
        kind: "system" as const,
        membershipId: null,
        name: "System",
        coverage: "recorded" as const,
      }
    : row.availableActorId && actorName
      ? {
          kind: "staff" as const,
          membershipId: row.availableActorId,
          name: actorName,
          coverage: "recorded" as const,
        }
      : {
          kind: "unknown" as const,
          membershipId: null,
          name: null,
          coverage: row.actorUserId
            ? ("unavailable" as const)
            : ("unknown" as const),
        }
  const parsed = implementedBusinessEventHandlers[type].schema.safeParse(
    row.payload,
  )
  const legacy =
    row.schemaVersion === 0 &&
    row.recordingOrigin === "legacy_fact" &&
    row.id.startsWith("legacy:")
      ? presentLegacyBusinessActivity(
          type,
          row.payload,
          actor.name ?? "Unknown person",
        )
      : null
  const available =
    Boolean(legacy) || (row.schemaVersion === 1 && parsed.success)
  const presentation =
    legacy ??
    (available
      ? presentBusinessEventPayload(
          type,
          row.payload,
          actor.name ?? "Unknown person",
        )
      : {
          summary: implementedBusinessEventHandlers[type].label,
          detail: "Recorded details are unavailable for this event version.",
          subject: null,
          amount: null,
          statusAtEvent: null,
          target: null,
        })
  const origin = businessActivityOriginSchema.safeParse({
    channel: row.originChannel,
  })
  return businessActivityViewSchema.parse({
    key: row.id,
    type,
    category: implementedBusinessEventHandlers[type].category,
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
    origin:
      origin.success && origin.data.channel !== "unknown" ? origin.data : null,
    actor,
    store: row.storeId ? { id: row.storeId, name: row.storeName } : null,
    ...presentation,
    currentStatus:
      available && type === "order.recorded" && row.currentOrderStatus
        ? { domain: "order", value: row.currentOrderStatus }
        : null,
    canOpen:
      presentation.target?.kind === "order" ||
      presentation.target?.kind === "payment"
        ? Boolean(row.currentOrderId)
        : presentation.target?.kind === "staff_member"
          ? Boolean(row.currentSubjectId)
          : presentation.target?.kind === "staff_invitation"
            ? Boolean(row.currentInvitationCommandId)
            : presentation.target?.kind === "finance_movement"
              ? Boolean(row.currentMovementId)
              : false,
    coverage: !available
      ? "partial"
      : row.recordingOrigin === "snapshot"
        ? "snapshot"
        : "legacy_fact",
  })
}

function conditions(
  scope: BusinessActivityScope,
  input: z.output<typeof businessActivityListInput>,
) {
  const clauses: Prisma.Sql[] = [businessActivityScopeSql(scope)]
  const known = Object.keys(implementedBusinessEventHandlers)
  clauses.push(Prisma.sql`e.type IN (${Prisma.join(known)})`)
  clauses.push(
    Prisma.sql`e."occurredAt">=${new Date(input.from)} AND e."occurredAt"<${new Date(input.to)}`,
  )
  if (input.categories)
    clauses.push(
      Prisma.sql`e.category IN (${Prisma.join([...new Set(input.categories)].sort())})`,
    )
  if (input.types)
    clauses.push(
      Prisma.sql`e.type IN (${Prisma.join([...new Set(input.types)].sort())})`,
    )
  if (input.actorMembershipId)
    clauses.push(Prisma.sql`e."actorMembershipId"=${input.actorMembershipId}`)
  if (input.subjectMembershipId)
    clauses.push(
      Prisma.sql`e."subjectMembershipId"=${input.subjectMembershipId}`,
    )
  if (input.actorKind === "unknown")
    clauses.push(
      Prisma.sql`(am.id IS NULL OR (au.name IS NULL AND au."displayName" IS NULL)) AND e."actorKind"<>'system'`,
    )
  else if (input.actorKind)
    clauses.push(Prisma.sql`e."actorKind"=${input.actorKind}`)
  if (input.storeIds) {
    if (
      input.storeIds.some(
        (id) => !scope.stores.some((store) => store.id === id),
      )
    )
      throw new BusinessActivityError(
        "FORBIDDEN",
        "A selected Store is outside your current Activity access.",
      )
    clauses.push(
      Prisma.sql`(e."recordingOrigin"='legacy_fact' AND e."storeId" IN (${Prisma.join([...new Set(input.storeIds)].sort())}) OR EXISTS(SELECT 1 FROM "BusinessActivityStoreScope" es WHERE es."tenantId"=e."tenantId" AND es."eventId"=e.id AND es."storeId" IN (${Prisma.join([...new Set(input.storeIds)].sort())})))`,
    )
  }
  if (input.target) {
    const target = input.target
    const sourceId =
      target.kind === "order" || target.kind === "payment"
        ? "orderId"
        : target.kind === "staff_member"
          ? "membershipId"
          : target.kind === "staff_invitation"
            ? "commandId"
            : target.kind === "finance_movement"
              ? "movementId"
              : null
    if (!sourceId) clauses.push(Prisma.sql`false`)
    else
      clauses.push(
        Prisma.sql`e.payload->>${sourceId}=${target.kind === "payment" ? target.orderId : target.id}`,
      )
  }
  if (input.q) {
    const pattern = `%${input.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    clauses.push(
      Prisma.sql`(e.type ILIKE ${pattern} OR e."originChannel" ILIKE ${pattern} OR e.payload->>'orderNumber' ILIKE ${pattern} OR e.payload->>'customerLabel' ILIKE ${pattern} OR au.name ILIKE ${pattern} OR au."displayName" ILIKE ${pattern})`,
    )
  }
  return Prisma.join(
    clauses.map((clause) => Prisma.sql`(${clause})`),
    " AND ",
  )
}

export async function listBusinessActivityInTransaction(
  tx: Prisma.TransactionClient,
  viewer: BusinessActivityViewer,
  raw: BusinessActivityListInput,
): Promise<BusinessActivityPage> {
  const input = businessActivityListInput.parse(raw)
  const scope = await businessActivityScope(tx, viewer)
  const { cursor, limit, ...filters } = input
  const filterKey = createHash("sha256")
    .update(
      JSON.stringify([
        BUSINESS_ACTIVITY_READ_VERSION,
        scope.signature,
        filters,
      ]),
    )
    .digest("hex")
  const after = cursor
    ? decodeBusinessActivityCursor(cursor, filterKey, new Date())
    : null
  const snapshotAt = after?.snapshotAt ?? new Date().toISOString()
  const sources = businessActivitySources(scope, {
    from: input.from,
    to: input.to,
    snapshotAt,
  })
  const where = Prisma.sql`${conditions(scope, input)} AND e."recordedAt"<=${new Date(snapshotAt)}`
  const bound = after
    ? input.sort === "oldest"
      ? Prisma.sql`AND (e."occurredAt",e.id)>(${new Date(after.at)},${after.id})`
      : Prisma.sql`AND (e."occurredAt",e.id)<(${new Date(after.at)},${after.id})`
    : Prisma.empty
  const order = input.sort === "oldest" ? Prisma.sql`ASC` : Prisma.sql`DESC`
  const rows = await tx.$queryRaw<
    ProjectedBusinessActivityRow[]
  >`${sources} SELECT ${businessActivityRowSelect} FROM "activitySources" e ${businessActivityJoins} WHERE ${where} ${bound} ORDER BY e."occurredAt" ${order},e.id ${order} LIMIT ${limit + 1}`
  const counts = await tx.$queryRaw<
    Array<{ total: bigint }>
  >`${sources} SELECT count(*)::bigint AS total FROM "activitySources" e ${businessActivityJoins} WHERE ${where}`
  const visible = rows.slice(0, limit)
  const last = visible.at(-1)
  return {
    items: visible.map(projectBusinessActivity),
    total: Number(counts[0]?.total ?? BigInt(0)),
    snapshotAt,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({
              at: last.occurredAt.toISOString(),
              id: last.id,
              snapshotAt,
              filterKey,
            }),
          ).toString("base64url")
        : null,
    coverage: {
      complete: false,
      detail:
        "Recorded snapshots plus original legacy Order/payment facts. Earlier Order amounts, customer and statuses are unavailable; remaining activity sources are not included yet.",
      unavailableTypes: [],
      legacyBefore: null,
    },
  }
}

export function listBusinessActivity(
  db: PrismaClient,
  viewer: BusinessActivityViewer,
  input: BusinessActivityListInput,
) {
  return db.$transaction(
    (tx) => listBusinessActivityInTransaction(tx, viewer, input),
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}

export async function getBusinessActivityInTransaction(
  tx: Prisma.TransactionClient,
  viewer: BusinessActivityViewer,
  key: string,
): Promise<BusinessActivityDetail> {
  const scope = await businessActivityScope(tx, viewer)
  const rows = await tx.$queryRaw<
    ProjectedBusinessActivityRow[]
  >`${businessActivitySources(scope)} SELECT ${businessActivityRowSelect} FROM "activitySources" e ${businessActivityJoins} WHERE ${businessActivityScopeSql(scope)} AND (
    e.id=${key} OR (e.type='order.recorded' AND ${key}='legacy:order:'||encode(sha256(convert_to(e.payload->>'orderId','UTF8')),'hex'))
    OR (e.type IN ('payment.recorded','payment.refund_recorded') AND ${key}='legacy:payment:'||encode(sha256(convert_to(e.payload->>'paymentId','UTF8')),'hex'))
  ) ORDER BY e."recordedAt" ASC,e.id ASC LIMIT 1`
  const row = rows[0]
  if (!row)
    throw new BusinessActivityError(
      "NOT_FOUND",
      "This activity is unavailable with your current access.",
    )
  return { event: projectBusinessActivity(row), changes: [], relatedEvents: [] }
}

export function getBusinessActivity(
  db: PrismaClient,
  viewer: BusinessActivityViewer,
  key: string,
) {
  return db.$transaction(
    (tx) => getBusinessActivityInTransaction(tx, viewer, key),
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
