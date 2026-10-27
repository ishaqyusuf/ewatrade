import { randomUUID } from "node:crypto"
import {
  paymentNotificationPeriod,
  paymentNotificationPolicySchema,
  paymentNotificationTierChanged,
} from "@ewatrade/utils/payment-report-notification-policy"
import { z } from "zod"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  paymentAlertCanReview,
  paymentAlertDestination,
} from "../manual-payment-alert-rules"
import { runInOwnTransaction } from "../own-transaction"
import { getRetailOpsTenantPlan } from "../retail-ops-subscriptions"
import type { DbClient } from "../types"
import { PaymentNotificationError } from "./policy"
import { paymentAlertMemberInclude } from "./quota"

export function claimPaymentNotificationPolicyChange(
  db: PrismaClient,
  now = new Date(),
) {
  return runInOwnTransaction(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(28410303)`
    const job = await tx.paymentNotificationPolicyChange.findFirst({
      where: { status: { not: "COMPLETED" } },
      orderBy: { revision: "asc" },
    })
    if (
      !job ||
      (job.status === "CLAIMED" &&
        job.claimExpiresAt &&
        job.claimExpiresAt > now)
    )
      return null
    return tx.paymentNotificationPolicyChange.update({
      where: { revision: job.revision },
      data: {
        status: "CLAIMED",
        claimId: randomUUID(),
        claimExpiresAt: new Date(now.getTime() + 120_000),
      },
    })
  })
}
/** One bounded page, with notice insertion and cursor progress in the same transaction. */
export async function processPaymentNotificationPolicyChange(
  db: PrismaClient,
  raw: { revision: number; claimId: string; limit?: number; now?: Date },
) {
  const input = z
    .object({
      revision: z.number().int().positive(),
      claimId: z.string().uuid(),
      limit: z.number().int().min(1).max(10).default(5),
      now: z.date().optional(),
    })
    .strict()
    .parse(raw)
  return runInOwnTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT revision FROM "PaymentNotificationPolicyChange" WHERE revision=${input.revision} FOR UPDATE`
    const job = await tx.paymentNotificationPolicyChange.findUniqueOrThrow({
      where: { revision: input.revision },
    })
    const now = input.now ?? new Date()
    if (
      job.status !== "CLAIMED" ||
      job.claimId !== input.claimId ||
      !job.claimExpiresAt ||
      job.claimExpiresAt <= now
    )
      throw new PaymentNotificationError(
        "CONFLICT",
        "Policy change claim expired.",
      )
    const before = paymentNotificationPolicySchema.parse(job.before)
    const after = paymentNotificationPolicySchema.parse(job.after)
    const tenants = await tx.tenant.findMany({
      where: {
        isActive: true,
        manualPaymentAlertSettings: {
          some: { createdAt: { lte: job.createdAt } },
        },
        ...(job.cursor ? { id: { gt: job.cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: input.limit + 1,
      select: { id: true },
    })
    let notices = 0
    for (const tenant of tenants.slice(0, input.limit)) {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${tenant.id} AND "isActive" FOR UPDATE`
      const active = await tx.tenant.findFirst({
        where: { id: tenant.id, isActive: true },
        select: { id: true },
      })
      if (!active) continue
      const { plan } = await getRetailOpsTenantPlan(tx, { tenantId: tenant.id })
      if (!paymentNotificationTierChanged(before, after, plan.id)) continue
      const settings = await tx.manualPaymentAlertSetting.findMany({
        where: {
          tenantId: tenant.id,
          createdAt: { lte: job.createdAt },
          account: { archivedAt: null, book: { tenantId: tenant.id } },
        },
      })
      if (!settings.length) continue
      const oldTier = before.tiers[plan.id]
      const newTier = after.tiers[plan.id]
      const waOff = oldTier.whatsapp.enabled && !newTier.whatsapp.enabled
      const waOn =
        !oldTier.whatsapp.enabled &&
        newTier.whatsapp.enabled &&
        newTier.whatsapp.limit !== 0
      let actionRequired = false
      let fallbackAccounts = 0
      for (const setting of settings) {
        if (setting.selectedPolicyRevision >= job.revision) continue
        if (setting.effectiveChannel === "email" && !newTier.email.enabled) {
          await tx.manualPaymentAlertSetting.update({
            where: { accountId: setting.accountId },
            data: { effectiveChannel: null },
          })
          actionRequired = true
          continue
        }
        if (
          !waOff ||
          setting.channel !== "whatsapp" ||
          setting.effectiveChannel !== "whatsapp"
        )
          continue
        const members = await tx.membership.findMany({
          where: {
            tenantId: tenant.id,
            userId: { in: setting.recipientUserIds },
            status: "ACTIVE",
          },
          include: paymentAlertMemberInclude,
        })
        const periodStart = new Date(paymentNotificationPeriod(now).startsAt)
        const usage = await tx.paymentNotificationQuota.findUnique({
          where: {
            tenantId_channel_periodStart: {
              tenantId: tenant.id,
              channel: "email",
              periodStart,
            },
          },
        })
        const fallback =
          setting.recipientUserIds.length > 0 &&
          members.length === setting.recipientUserIds.length &&
          members.every(
            (m) =>
              paymentAlertCanReview(m) && paymentAlertDestination(m, "email"),
          ) &&
          newTier.email.enabled &&
          (newTier.email.limit === null ||
            (usage?.used ?? 0) + (usage?.reserved ?? 0) + members.length <=
              newTier.email.limit)
        await tx.manualPaymentAlertSetting.update({
          where: { accountId: setting.accountId },
          data: { effectiveChannel: fallback ? "email" : null },
        })
        if (fallback) fallbackAccounts++
        else actionRequired = true
      }
      const kind = actionRequired
        ? "action_required"
        : waOff && fallbackAccounts > 0
          ? "whatsapp_disabled"
          : waOn
            ? "whatsapp_available"
            : "limits_changed"
      const title = actionRequired
        ? "Payment alerts need your attention"
        : waOn
          ? "WhatsApp payment notifications available"
          : "Payment notification settings changed"
      const summary = (channel: "email" | "whatsapp") =>
        `${channel === "email" ? "Email" : "WhatsApp"}: ${oldTier[channel].enabled ? "enabled" : "disabled"} / ${oldTier[channel].limit ?? "Unlimited"} → ${newTier[channel].enabled ? "enabled" : "disabled"} / ${newTier[channel].limit ?? "Unlimited"}.`
      const description = actionRequired
        ? "Payment notifications are paused for one or more bank accounts. Review bank notification settings. Reports remain in Payments to check."
        : waOff && fallbackAccounts > 0
          ? "WhatsApp payment notifications are no longer available. Eligible new alerts will use Email; current capacity and verified recipients are checked before each send."
          : waOn
            ? "You can now configure WhatsApp payment notifications. Your saved bank choices have not changed."
            : `${summary("email")} ${summary("whatsapp")} Usage and reservations are retained. Paused bank choices stay paused until reviewed. Limits reset at 00:00 UTC on the first of the month.`
      await tx.paymentNotificationNotice.upsert({
        where: {
          tenantId_policyRevision: {
            tenantId: tenant.id,
            policyRevision: job.revision,
          },
        },
        create: {
          tenantId: tenant.id,
          policyRevision: job.revision,
          kind,
          title,
          description,
          accountIds: settings.map((s) => s.accountId),
        },
        update: {},
      })
      notices++
    }
    const completed = tenants.length <= input.limit
    const cursor =
      tenants[Math.min(tenants.length, input.limit) - 1]?.id ?? job.cursor
    await tx.paymentNotificationPolicyChange.update({
      where: { revision: job.revision },
      data: {
        cursor,
        status: completed ? "COMPLETED" : "CLAIMED",
        claimExpiresAt: completed ? null : new Date(now.getTime() + 120_000),
      },
    })
    return { revision: job.revision, completed, cursor, notices }
  })
}
async function noticeAudience(
  db: DbClient,
  input: { tenantId: string; actorUserId: string },
) {
  const member = await db.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    include: paymentAlertMemberInclude,
  })
  if (!member || !paymentAlertCanReview(member))
    throw new PaymentNotificationError(
      "FORBIDDEN",
      "Current Business payment access is required.",
    )
  const settings = await db.manualPaymentAlertSetting.findMany({
    where: {
      tenantId: input.tenantId,
      account: { archivedAt: null, book: { tenantId: input.tenantId } },
      ...(!["OWNER", "ADMIN"].includes(member.role)
        ? { recipientUserIds: { has: member.userId } }
        : {}),
    },
    select: { accountId: true, account: { select: { bookId: true } } },
  })
  let allowed = settings
  if (!["OWNER", "ADMIN"].includes(member.role)) {
    const scope: Prisma.CommercialOrderWhereInput = {
      tenantId: input.tenantId,
      ...(member.staffAccessMode === "SCOPED"
        ? {
            storeId: { in: member.staffStoreAssignments.map((a) => a.storeId) },
          }
        : {}),
      ...(["CASHIER", "OPERATOR"].includes(member.role)
        ? {
            OR: [
              { createdByUserId: member.userId },
              { store: { salesRepOrderVisibility: "ALL_STORE_ORDERS" } },
            ],
          }
        : {}),
    }
    const links = await db.manualPaymentLink.findMany({
      where: {
        tenantId: input.tenantId,
        bankAccountId: { in: settings.map((s) => s.accountId) },
        reports: { some: {} },
        order: scope,
      },
      select: { bankAccountId: true },
      distinct: ["bankAccountId"],
    })
    const visible = new Set(links.map((l) => l.bankAccountId))
    allowed = settings.filter((s) => visible.has(s.accountId))
  }
  return {
    membershipId: member.id,
    accountIds: allowed.map((s) => s.accountId),
    books: new Map(allowed.map((s) => [s.accountId, s.account.bookId])),
  }
}
export async function listPaymentNotificationChanges(
  db: DbClient,
  input: {
    tenantId: string
    actorUserId: string
    limit?: number
    beforeId?: string
  },
) {
  const limit = z
    .number()
    .int()
    .min(1)
    .max(50)
    .parse(input.limit ?? 20)
  const audience = await noticeAudience(db, input)
  const where = {
    tenantId: input.tenantId,
    accountIds: { hasSome: audience.accountIds },
  }
  const [rows, unreadCount] = await Promise.all([
    db.paymentNotificationNotice.findMany({
      where: {
        ...where,
        ...(input.beforeId ? { id: { lt: input.beforeId } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit + 1,
      include: {
        reads: {
          where: {
            membershipId: audience.membershipId,
            tenantId: input.tenantId,
          },
          select: { readAt: true },
        },
      },
    }),
    db.paymentNotificationNotice.count({
      where: {
        ...where,
        reads: {
          none: {
            membershipId: audience.membershipId,
            tenantId: input.tenantId,
          },
        },
      },
    }),
  ])
  return {
    items: rows.slice(0, limit).map((r) => ({
      id: r.id,
      policyRevision: r.policyRevision,
      kind: r.kind,
      title: r.title,
      description: r.description,
      createdAt: r.createdAt,
      accountIds: r.accountIds.filter((id) => audience.accountIds.includes(id)),
      bookId: (() => {
        const books = [
          ...new Set(
            r.accountIds
              .filter((id) => audience.accountIds.includes(id))
              .map((id) => audience.books.get(id))
              .filter((id): id is string => !!id),
          ),
        ]
        return books.length === 1 ? (books[0] ?? null) : null
      })(),
      readAt: r.reads[0]?.readAt ?? null,
    })),
    nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
    unreadCount,
  }
}
export function markPaymentNotificationChangesRead(
  db: PrismaClient,
  input: { tenantId: string; actorUserId: string; ids: string[] },
) {
  const ids = z
    .array(z.string().min(1).max(128))
    .min(1)
    .max(50)
    .parse(input.ids)
  if (new Set(ids).size !== ids.length)
    throw new PaymentNotificationError(
      "BAD_REQUEST",
      "Choose distinct notices.",
    )
  return runInOwnTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId"=${input.tenantId} AND "userId"=${input.actorUserId} FOR SHARE`
    const audience = await noticeAudience(tx, input)
    const rows = await tx.paymentNotificationNotice.findMany({
      where: {
        id: { in: ids },
        tenantId: input.tenantId,
        accountIds: { hasSome: audience.accountIds },
      },
      select: { id: true },
    })
    if (rows.length !== ids.length)
      throw new PaymentNotificationError(
        "FORBIDDEN",
        "A notice is unavailable in your current Business scope.",
      )
    for (const row of rows)
      await tx.paymentNotificationNoticeRead.upsert({
        where: {
          noticeId_membershipId: {
            noticeId: row.id,
            membershipId: audience.membershipId,
          },
        },
        create: {
          noticeId: row.id,
          membershipId: audience.membershipId,
          tenantId: input.tenantId,
        },
        update: {},
      })
    return { ok: true as const }
  })
}
