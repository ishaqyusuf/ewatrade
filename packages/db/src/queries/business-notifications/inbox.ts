import { createHash } from "node:crypto"
import {
  type BusinessNotificationPage,
  businessNotificationListInput,
  businessNotificationMarkAllInput,
  businessNotificationReceiptInput,
} from "@ewatrade/notifications/business-events"
import { z } from "zod"
import { Prisma } from "../../../generated/prisma/client"
import { BusinessActivityError } from "../business-activity/errors"
import {
  type ProjectedBusinessActivityRow,
  businessActivityJoins,
  businessActivityRowSelect,
  projectBusinessActivity,
} from "../business-activity/read"
import type { BusinessActivityViewer } from "../business-activity/scope"
import { eligibleNotificationEventSql, notificationScope } from "./state"

type Tx = Prisma.TransactionClient
const positionSchema = z
  .object({
    at: z.iso.datetime(),
    id: z.string().min(1).max(160),
    snapshotAt: z.iso.datetime(),
    binding: z.string().length(64),
  })
  .strict()
const receiptJoin = Prisma.sql`JOIN "BusinessActivityEvent" e ON e.id=r."eventId" AND e."tenantId"=r."tenantId"`

export async function countMyBusinessNotifications(
  tx: Tx,
  viewer: BusinessActivityViewer,
) {
  const { member, scope } = await notificationScope(tx, viewer)
  const asOf = new Date().toISOString()
  if (!scope) return { count: 0, asOf }
  const rows = await tx.$queryRaw<
    Array<{ count: bigint }>
  >`SELECT count(*)::bigint AS count FROM "BusinessNotificationReceipt" r ${receiptJoin}
    WHERE r."tenantId"=${viewer.tenantId} AND r."membershipId"=${member.id} AND r.state='UNREAD' AND ${eligibleNotificationEventSql(scope)}`
  return { count: Number(rows[0]?.count ?? BigInt(0)), asOf }
}
export async function listMyBusinessNotifications(
  tx: Tx,
  viewer: BusinessActivityViewer,
  raw: z.input<typeof businessNotificationListInput>,
): Promise<BusinessNotificationPage> {
  const input = businessNotificationListInput.parse(raw)
  const { member, scope } = await notificationScope(tx, viewer)
  const now = new Date()
  if (!scope)
    return {
      items: [],
      nextCursor: null,
      snapshotAt: now.toISOString(),
      unreadCount: 0,
    }
  const binding = createHash("sha256")
    .update(
      JSON.stringify([
        scope.signature,
        input.state,
        input.types ? [...new Set(input.types)].sort() : null,
      ]),
    )
    .digest("hex")
  let after: z.output<typeof positionSchema> | null = null
  if (input.cursor) {
    try {
      after = positionSchema.parse(
        JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
      )
      if (
        after.binding !== binding ||
        Date.parse(after.snapshotAt) > now.getTime()
      )
        throw Error("Changed notification query")
    } catch {
      throw new BusinessActivityError(
        "BAD_REQUEST",
        "Refresh notifications after changing filters or access.",
      )
    }
  }
  const snapshotAt = after?.snapshotAt ?? now.toISOString()
  const owner = Prisma.sql`r."tenantId"=${viewer.tenantId} AND r."membershipId"=${member.id} AND ${eligibleNotificationEventSql(scope)}`
  const state =
    input.state === "all"
      ? Prisma.empty
      : Prisma.sql`AND r.state::text=${input.state.toUpperCase()}`
  const type = input.types
    ? Prisma.sql`AND e.type IN (${Prisma.join(input.types)})`
    : Prisma.empty
  const bound = after
    ? Prisma.sql`AND (r."occurredAt",r.id)<(${new Date(after.at)},${after.id})`
    : Prisma.empty
  const rows = await tx.$queryRaw<
    Array<
      ProjectedBusinessActivityRow & {
        receiptId: string
        receiptState: "UNREAD" | "READ" | "ARCHIVED"
        readAt: Date | null
        archivedAt: Date | null
        receiptOccurredAt: Date
      }
    >
  >`
    SELECT ${businessActivityRowSelect},r.id AS "receiptId",r.state::text AS "receiptState",r."readAt",r."archivedAt",r."occurredAt" AS "receiptOccurredAt"
    FROM "BusinessNotificationReceipt" r ${receiptJoin} ${businessActivityJoins}
    WHERE ${owner} AND r."createdAt"<=${new Date(snapshotAt)} ${state} ${type} ${bound}
    ORDER BY r."occurredAt" DESC,r.id DESC LIMIT ${input.limit + 1}`
  const counts = await tx.$queryRaw<
    Array<{ count: bigint }>
  >`SELECT count(*)::bigint AS count FROM "BusinessNotificationReceipt" r ${receiptJoin} WHERE ${owner} AND r.state='UNREAD'`
  const visible = rows.slice(0, input.limit)
  const last = visible.at(-1)
  return {
    items: visible.map((row) => ({
      id: row.receiptId,
      event: projectBusinessActivity(row),
      state:
        row.receiptState === "UNREAD"
          ? "unread"
          : row.receiptState === "READ"
            ? "read"
            : "archived",
      readAt: row.readAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
    })),
    nextCursor:
      rows.length > input.limit && last
        ? Buffer.from(
            JSON.stringify({
              at: last.receiptOccurredAt.toISOString(),
              id: last.receiptId,
              snapshotAt,
              binding,
            }),
          ).toString("base64url")
        : null,
    snapshotAt,
    unreadCount: Number(counts[0]?.count ?? BigInt(0)),
  }
}
export async function updateMyBusinessNotificationReceipts(
  tx: Tx,
  viewer: BusinessActivityViewer,
  action: "read" | "archive",
  raw: z.input<typeof businessNotificationReceiptInput>,
) {
  const input = businessNotificationReceiptInput.parse(raw)
  const ids = [...new Set(input.receiptIds)].sort()
  const { member, scope } = await notificationScope(tx, viewer)
  if (!scope)
    throw new BusinessActivityError(
      "NOT_FOUND",
      "These notifications are unavailable with your current access.",
    )
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT r.id FROM "BusinessNotificationReceipt" r ${receiptJoin}
    WHERE r."tenantId"=${viewer.tenantId} AND r."membershipId"=${member.id} AND r.id IN (${Prisma.join(ids)}) AND ${eligibleNotificationEventSql(scope)} ORDER BY r.id FOR UPDATE OF r`
  if (rows.length !== ids.length)
    throw new BusinessActivityError(
      "NOT_FOUND",
      "These notifications are unavailable with your current access.",
    )
  const saved = await tx.businessNotificationReceipt.updateMany({
    where: {
      tenantId: viewer.tenantId,
      membershipId: member.id,
      id: { in: ids },
      ...(action === "read"
        ? { state: "UNREAD" }
        : { state: { not: "ARCHIVED" } }),
    },
    data:
      action === "read"
        ? { state: "READ", readAt: new Date() }
        : { state: "ARCHIVED", archivedAt: new Date() },
  })
  return { updated: saved.count }
}
export async function markAllMyBusinessNotificationsRead(
  tx: Tx,
  viewer: BusinessActivityViewer,
  raw: z.input<typeof businessNotificationMarkAllInput>,
) {
  const input = businessNotificationMarkAllInput.parse(raw)
  const through = new Date(input.through)
  if (through.getTime() > Date.now())
    throw new BusinessActivityError(
      "BAD_REQUEST",
      "Choose the notification snapshot already displayed.",
    )
  const { member, scope } = await notificationScope(tx, viewer)
  if (!scope) return { updated: 0 }
  const updated =
    await tx.$executeRaw`UPDATE "BusinessNotificationReceipt" r SET state='READ',"readAt"=CURRENT_TIMESTAMP
    WHERE r."tenantId"=${viewer.tenantId} AND r."membershipId"=${member.id} AND r.state='UNREAD' AND r."createdAt"<=${through}
      AND EXISTS (SELECT 1 FROM "BusinessActivityEvent" e WHERE e.id=r."eventId" AND e."tenantId"=r."tenantId" AND ${eligibleNotificationEventSql(scope)})`
  return { updated }
}
