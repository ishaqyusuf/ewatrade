import {
  WHATSAPP_TRANSPORT_LIMITS,
  WHATSAPP_USAGE_RETENTION_AFTER_WINDOW_MS,
} from "@ewatrade/assistant/channels/policy"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"

/** Domain calls already hold fresh scope. Quotas are server policy, never caller-selected allowances. */
export async function reserveAssistantWhatsAppTransportInTransaction(
  tx: Prisma.TransactionClient,
  scope: { userId: string; tenantId: string },
  kind: "ingress" | "deliveryAttempts",
  now = new Date(),
) {
  const actor = { userId: scope.userId, tenantId: scope.tenantId }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assistant-whatsapp-user:${scope.userId}`},0))`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assistant-whatsapp-tenant:${scope.tenantId}`},0))`
  const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000)
  const day = new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000)
  const rows = await tx.$queryRaw<
    {
      windowKind: "MINUTE" | "DAY"
      userIngress: bigint | null
      userDelivery: bigint | null
      tenantIngress: bigint | null
      tenantDelivery: bigint | null
    }[]
  >`
    SELECT "windowKind",
      SUM(ingress) FILTER (WHERE "userId"=${scope.userId}) AS "userIngress",
      SUM("deliveryAttempts") FILTER (WHERE "userId"=${scope.userId}) AS "userDelivery",
      SUM(ingress) FILTER (WHERE "tenantId"=${scope.tenantId}) AS "tenantIngress",
      SUM("deliveryAttempts") FILTER (WHERE "tenantId"=${scope.tenantId}) AS "tenantDelivery"
    FROM "AssistantWhatsAppUsageBucket"
    WHERE ("userId"=${scope.userId} OR "tenantId"=${scope.tenantId})
    AND (("windowKind"='MINUTE' AND "windowStartedAt"=${minute}) OR ("windowKind"='DAY' AND "windowStartedAt"=${day}))
    GROUP BY "windowKind"
  `
  const windows = [
    {
      windowKind: "MINUTE" as const,
      startedAt: minute,
      endsAt: new Date(minute.getTime() + 60_000),
    },
    {
      windowKind: "DAY" as const,
      startedAt: day,
      endsAt: new Date(day.getTime() + 86_400_000),
    },
  ]
  let retryAt: Date | null = null
  for (const window of windows) {
    const row = rows.find((row) => row.windowKind === window.windowKind)
    const user = Number(
      (kind === "ingress" ? row?.userIngress : row?.userDelivery) ?? 0n,
    )
    const tenant = Number(
      (kind === "ingress" ? row?.tenantIngress : row?.tenantDelivery) ?? 0n,
    )
    if (
      ![user, tenant].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    )
      throw Error("Assistant transport usage unavailable.")
    const limits = WHATSAPP_TRANSPORT_LIMITS[window.windowKind]
    if (user >= limits.user[kind] || tenant >= limits.tenant[kind])
      if (!retryAt || window.endsAt > retryAt) retryAt = window.endsAt
  }
  if (retryAt) return { allowed: false as const, retryAt }
  for (const window of windows)
    await tx.assistantWhatsAppUsageBucket.upsert({
      where: {
        tenantId_userId_windowKind_windowStartedAt: {
          ...actor,
          windowKind: window.windowKind,
          windowStartedAt: window.startedAt,
        },
      },
      create: {
        ...actor,
        windowKind: window.windowKind,
        windowStartedAt: window.startedAt,
        windowEndsAt: window.endsAt,
        expiresAt: new Date(
          window.endsAt.getTime() + WHATSAPP_USAGE_RETENTION_AFTER_WINDOW_MS,
        ),
        [kind]: 1,
      },
      update: { [kind]: { increment: 1 } },
    })
  return { allowed: true as const }
}
/** Short-lived counters are independent of canonical history; expiry never refunds a live window. */
export async function expireAssistantWhatsAppUsage(
  db: PrismaClient,
  now = new Date(),
  bucketIds?: readonly string[],
) {
  const rows = await db.assistantWhatsAppUsageBucket.findMany({
    where: {
      id: bucketIds ? { in: [...bucketIds] } : undefined,
      expiresAt: { lte: now },
    },
    orderBy: { expiresAt: "asc" },
    take: 500,
    select: { id: true },
  })
  const result = await db.assistantWhatsAppUsageBucket.deleteMany({
    where: { id: { in: rows.map((row) => row.id) }, expiresAt: { lte: now } },
  })
  return { cleared: result.count }
}
