import { randomUUID } from "node:crypto"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import type { DbClient } from "./types"

/**
 * After-commit delivery of new-request alerts to the business.
 *
 * The alert row is written in the same transaction as the request, so the
 * request never depends on delivery. Delivery claims rows (SKIP LOCKED), calls a
 * host-provided adapter and records SENT / FAILED (retried with backoff) /
 * SKIPPED (no consented channel). In-app pending counts remain the guaranteed
 * notice; automatic WhatsApp is an additional channel only when the host
 * supplies an enabled, consented adapter.
 */

export type StorefrontMerchantAlertMessage = {
  alertId: string
  tenantId: string
  storeId: string
  businessName: string
  kind: "order" | "service"
  reference: string
  summary: string
  event: "new" | "reply" | "quote_declined"
}

export type StorefrontMerchantAlertAdapter = {
  name: string
  /** Null when this business has no consented recipient for automatic alerts. */
  recipientFor(input: {
    tenantId: string
    storeId: string
  }): Promise<{ phoneE164: string } | null>
  send(
    message: StorefrontMerchantAlertMessage & { phoneE164: string },
  ): Promise<{ providerMessageId: string }>
}

const MAX_ATTEMPTS = 5
const CLAIM_MS = 2 * 60_000
const backoffMs = (attempt: number) =>
  Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1))

function eventOf(dedupeKey: string): StorefrontMerchantAlertMessage["event"] {
  if (dedupeKey.includes(":reply:")) return "reply"
  if (dedupeKey.includes(":quote-declined:")) return "quote_declined"
  return "new"
}

export async function dispatchStorefrontMerchantAlerts(
  db: PrismaClient,
  input: {
    adapter: StorefrontMerchantAlertAdapter | null
    limit?: number
    /** Restrict to just-created alerts (inline after-commit attempt). */
    alertIds?: string[]
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  const claimId = randomUUID()
  const limit = Math.min(input.limit ?? 20, 100)
  const onlyIds = input.alertIds?.length
    ? Prisma.sql`AND "id" IN (${Prisma.join(input.alertIds)})`
    : Prisma.empty
  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE "StorefrontMerchantAlert" SET "claimId" = ${claimId},
      "claimExpiresAt" = ${new Date(now.getTime() + CLAIM_MS)}, "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "StorefrontMerchantAlert"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
        AND ("claimExpiresAt" IS NULL OR "claimExpiresAt" < ${now})
        ${onlyIds}
      ORDER BY "nextAttemptAt" ASC LIMIT ${limit}
      FOR UPDATE SKIP LOCKED)
    RETURNING "id"`
  const results: { id: string; status: string }[] = []
  for (const { id } of claimed) {
    const alert = await db.storefrontMerchantAlert.findFirst({
      where: { id, claimId },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        kind: true,
        attemptCount: true,
        dedupeKey: true,
        tenant: { select: { name: true } },
        orderRequest: {
          select: {
            reference: true,
            customerName: true,
            lines: { select: { itemName: true }, take: 3 },
          },
        },
        serviceContext: {
          select: {
            reference: true,
            serviceRequest: {
              select: {
                customerName: true,
                lines: {
                  take: 3,
                  select: {
                    offering: {
                      select: { catalogItem: { select: { name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!alert) continue
    const finish = (data: {
      status: "SENT" | "FAILED" | "SKIPPED" | "PENDING"
      lastError?: string | null
      providerMessageId?: string
      nextAttemptAt?: Date
    }) =>
      db.storefrontMerchantAlert.updateMany({
        where: { id: alert.id, claimId },
        data: {
          ...data,
          attemptCount: { increment: data.status === "SKIPPED" ? 0 : 1 },
          claimId: null,
          claimExpiresAt: null,
          ...(data.status === "SENT" ? { sentAt: new Date() } : {}),
        },
      })
    const recipient = input.adapter
      ? await input.adapter
          .recipientFor({ tenantId: alert.tenantId, storeId: alert.storeId })
          .catch(() => null)
      : null
    if (!input.adapter || !recipient) {
      await finish({
        status: "SKIPPED",
        lastError: input.adapter
          ? "No business WhatsApp number has opted in to automatic alerts."
          : "Automatic WhatsApp alerts aren't enabled. The request is in your inbox.",
      })
      results.push({ id, status: "SKIPPED" })
      continue
    }
    const order = alert.orderRequest
    const service = alert.serviceContext
    const message: StorefrontMerchantAlertMessage = {
      alertId: alert.id,
      tenantId: alert.tenantId,
      storeId: alert.storeId,
      businessName: alert.tenant.name,
      kind: alert.kind === "ORDER" ? "order" : "service",
      reference: order?.reference ?? service?.reference ?? "",
      summary: order
        ? `${order.customerName}: ${order.lines.map((line) => line.itemName).join(", ")}`
        : `${service?.serviceRequest.customerName ?? ""}: ${[
            ...new Set(
              service?.serviceRequest.lines.map(
                (line) => line.offering.catalogItem.name,
              ) ?? [],
            ),
          ].join(", ")}`,
      event: eventOf(alert.dedupeKey),
    }
    try {
      const sent = await input.adapter.send({
        ...message,
        phoneE164: recipient.phoneE164,
      })
      await finish({
        status: "SENT",
        lastError: null,
        providerMessageId: sent.providerMessageId,
      })
      results.push({ id, status: "SENT" })
    } catch (error) {
      const attempt = alert.attemptCount + 1
      const reason =
        error instanceof Error ? error.message.slice(0, 300) : "Send failed."
      await finish(
        attempt >= MAX_ATTEMPTS
          ? { status: "FAILED", lastError: reason }
          : {
              status: "PENDING",
              lastError: reason,
              nextAttemptAt: new Date(now.getTime() + backoffMs(attempt)),
            },
      )
      results.push({ id, status: attempt >= MAX_ATTEMPTS ? "FAILED" : "RETRY" })
    }
  }
  return results
}

/** Staff retry of a failed/skipped alert: re-queues the same deduplicated row. */
export async function retryStorefrontMerchantAlert(
  db: DbClient,
  input: { tenantId: string; storeIds: readonly string[]; alertId: string },
) {
  const updated = await db.storefrontMerchantAlert.updateMany({
    where: {
      id: input.alertId,
      tenantId: input.tenantId,
      storeId: { in: [...input.storeIds] },
      status: { in: ["FAILED", "SKIPPED"] },
    },
    data: {
      status: "PENDING",
      nextAttemptAt: new Date(),
      attemptCount: 0,
      claimId: null,
      claimExpiresAt: null,
    },
  })
  return { requeued: updated.count === 1 }
}
