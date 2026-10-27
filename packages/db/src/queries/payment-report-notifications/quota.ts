import {
  type PaymentNotificationChannel,
  paymentNotificationChannelSchema,
  paymentNotificationPeriod,
} from "@ewatrade/utils/payment-report-notification-policy"
import { z } from "zod"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { assertFinanceManager } from "../finance/access"
import {
  type PaymentAlertMember,
  paymentAlertCanReview,
  paymentAlertDestination,
} from "../manual-payment-alert-rules"
import { runInOwnTransaction } from "../own-transaction"
import { getRetailOpsTenantPlan } from "../retail-ops-subscriptions"
import {
  PaymentNotificationError,
  loadPaymentNotificationPolicy,
  paymentNotificationPolicyKey,
} from "./policy"

const identity = z.string().trim().min(1).max(128)
const reportInput = z
  .object({ tenantId: identity, reportId: identity, now: z.date().optional() })
  .strict()
const memberInclude = {
  user: {
    select: {
      name: true,
      email: true,
      emailVerified: true,
      phone: true,
      phoneVerifiedAt: true,
    },
  },
  staffStoreAssignments: {
    where: { status: "ACTIVE" as const, store: { status: "ACTIVE" as const } },
    select: { storeId: true, status: true },
  },
} as const
export const paymentAlertMemberInclude = memberInclude

async function lockAuthority(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$queryRaw`SELECT key FROM "SystemConfiguration" WHERE key=${paymentNotificationPolicyKey} FOR SHARE`
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "Tenant" WHERE id=${tenantId} AND "isActive" FOR UPDATE`
  if (!rows.length)
    throw new PaymentNotificationError("NOT_FOUND", "Business unavailable.")
  await tx.$queryRaw`SELECT "tenantId" FROM "TenantSubscription" WHERE "tenantId"=${tenantId} FOR SHARE`
}
async function reportGroup(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; reportId: string },
) {
  const report = await tx.manualPaymentReport.findFirst({
    where: { id: input.reportId, link: { tenantId: input.tenantId } },
    include: {
      link: {
        include: {
          order: {
            include: {
              store: {
                select: { salesRepOrderVisibility: true, status: true },
              },
            },
          },
          bankAccount: { include: { book: { select: { tenantId: true } } } },
        },
      },
    },
  })
  if (!report)
    throw new PaymentNotificationError(
      "NOT_FOUND",
      "Payment report unavailable.",
    )
  if (
    report.status !== "SUBMITTED" ||
    report.link.closedAt ||
    report.link.bankAccount.archivedAt ||
    report.link.bankAccount.book.tenantId !== input.tenantId ||
    report.link.order.store.status !== "ACTIVE"
  )
    return null
  await tx.$queryRaw`SELECT "accountId" FROM "ManualPaymentAlertSetting" WHERE "accountId"=${report.link.bankAccountId} AND "tenantId"=${input.tenantId} FOR SHARE`
  const setting = await tx.manualPaymentAlertSetting.findFirst({
    where: { accountId: report.link.bankAccountId, tenantId: input.tenantId },
  })
  if (
    !setting ||
    setting.recipientUserIds.length < 1 ||
    setting.recipientUserIds.length > 20 ||
    new Set(setting.recipientUserIds).size !==
      setting.recipientUserIds.length ||
    !paymentNotificationChannelSchema.safeParse(setting.channel).success ||
    (setting.effectiveChannel !== null &&
      !paymentNotificationChannelSchema.safeParse(setting.effectiveChannel)
        .success)
  )
    return null
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId"=${input.tenantId} AND "userId" IN (${PrismaJoin(setting.recipientUserIds)}) FOR SHARE`
  const members = await tx.membership.findMany({
    where: {
      tenantId: input.tenantId,
      userId: { in: setting.recipientUserIds },
      status: "ACTIVE",
    },
    include: memberInclude,
  })
  const authorized = members.filter(
    (member) =>
      paymentAlertCanReview(member, report.link.order.storeId) &&
      (!["CASHIER", "OPERATOR"].includes(member.role) ||
        report.link.order.store.salesRepOrderVisibility ===
          "ALL_STORE_ORDERS" ||
        report.link.order.createdByUserId === member.userId),
  )
  if (authorized.length !== setting.recipientUserIds.length) return null
  return { report, setting, members: authorized }
}
// Import the runtime SQL helper separately from generated client types.
import { Prisma as Sql } from "../../../generated/prisma/client"
const PrismaJoin = (ids: string[]) => Sql.join(ids)
const key = (tenantId: string, channel: string, periodStart: Date) => ({
  tenantId_channel_periodStart: { tenantId, channel, periodStart },
})
async function bucket(
  tx: Prisma.TransactionClient,
  tenantId: string,
  channel: string,
  periodStart: Date,
) {
  return tx.paymentNotificationQuota.upsert({
    where: key(tenantId, channel, periodStart),
    create: { tenantId, channel, periodStart },
    update: {},
  })
}
function groupHasContacts(
  members: PaymentAlertMember[],
  channel: PaymentNotificationChannel,
) {
  return members.every((m) => paymentAlertDestination(m, channel) !== null)
}
function capacity(
  limit: number | null,
  used: number,
  reserved: number,
  requested: number,
) {
  return limit === null || used + reserved + requested <= limit
}

export async function reservePaymentNotificationGroupInTransaction(
  tx: Prisma.TransactionClient,
  raw: { tenantId: string; reportId: string; now?: Date },
) {
  const input = reportInput.parse(raw)
  const now = input.now ?? new Date()
  await lockAuthority(tx, input.tenantId)
  // A report keeps its original recipient/channel binding across configuration edits.
  const existing = await tx.paymentNotificationIntent.findMany({
    where: { tenantId: input.tenantId, reportId: input.reportId },
    orderBy: { id: "asc" },
  })
  if (existing.length)
    return { state: "existing" as const, intentIds: existing.map((r) => r.id) }
  const group = await reportGroup(tx, input)
  if (!group)
    return {
      state: "blocked" as const,
      intentIds: [],
      reason: "recipient_or_report_unavailable",
    }
  let policyState: Awaited<ReturnType<typeof loadPaymentNotificationPolicy>>
  try {
    policyState = await loadPaymentNotificationPolicy(tx)
  } catch (error) {
    if (
      error instanceof PaymentNotificationError &&
      error.code === "UNAVAILABLE"
    )
      return {
        state: "blocked" as const,
        intentIds: [],
        reason: "policy_invalid",
      }
    throw error
  }
  const { policy, configured } = policyState
  if (!configured)
    return {
      state: "blocked" as const,
      intentIds: [],
      reason: "policy_missing",
    }
  const { plan } = await getRetailOpsTenantPlan(tx, input)
  if (group.setting.effectiveChannel === null)
    return {
      state: "blocked" as const,
      intentIds: [],
      reason: "configuration_paused",
    }
  let channel = paymentNotificationChannelSchema.parse(
    group.setting.effectiveChannel,
  )
  // Fallback only for a policy-disabled WhatsApp channel, never exhaustion and never back automatically.
  if (
    group.setting.channel === "whatsapp" &&
    channel === "whatsapp" &&
    !policy.tiers[plan.id].whatsapp.enabled
  )
    channel = "email"
  const config = policy.tiers[plan.id][channel]
  if (!config.enabled || !groupHasContacts(group.members, channel))
    return {
      state: "blocked" as const,
      intentIds: [],
      reason: "plan_or_contacts_unavailable",
    }
  const periodStart = new Date(paymentNotificationPeriod(now).startsAt)
  const quota = await bucket(tx, input.tenantId, channel, periodStart)
  if (!capacity(config.limit, quota.used, quota.reserved, group.members.length))
    return {
      state: "blocked" as const,
      intentIds: [],
      reason: "quota_exhausted",
    }
  await tx.paymentNotificationQuota.update({
    where: key(input.tenantId, channel, periodStart),
    data: { reserved: { increment: group.members.length } },
  })
  if (channel !== group.setting.effectiveChannel)
    await tx.manualPaymentAlertSetting.update({
      where: { accountId: group.setting.accountId },
      data: { effectiveChannel: channel },
    })
  const intentIds: string[] = []
  for (const member of group.members) {
    const intent = await tx.paymentNotificationIntent.create({
      data: {
        tenantId: input.tenantId,
        reportId: input.reportId,
        recipientUserId: member.userId,
        membershipId: member.id,
        channel,
        periodStart,
        policyRevision: policy.revision,
        settingRevision: group.setting.revision,
      },
    })
    intentIds.push(intent.id)
  }
  return { state: "reserved" as const, intentIds }
}
export function reservePaymentNotificationGroup(
  db: PrismaClient,
  input: { tenantId: string; reportId: string; now?: Date },
) {
  return runInOwnTransaction(db, (tx) =>
    reservePaymentNotificationGroupInTransaction(tx, input),
  )
}
async function lockIntent(
  tx: Prisma.TransactionClient,
  tenantId: string,
  intentId: string,
) {
  await tx.$queryRaw`SELECT id FROM "PaymentNotificationIntent" WHERE id=${intentId} AND "tenantId"=${tenantId} FOR UPDATE`
  const intent = await tx.paymentNotificationIntent.findFirst({
    where: { id: intentId, tenantId },
  })
  if (!intent)
    throw new PaymentNotificationError("NOT_FOUND", "Notification unavailable.")
  return intent
}
async function release(
  tx: Prisma.TransactionClient,
  intent: { tenantId: string; channel: string; periodStart: Date },
) {
  const result = await tx.paymentNotificationQuota.updateMany({
    where: {
      tenantId: intent.tenantId,
      channel: intent.channel,
      periodStart: intent.periodStart,
      reserved: { gt: 0 },
    },
    data: { reserved: { decrement: 1 } },
  })
  if (result.count !== 1)
    throw new PaymentNotificationError(
      "CONFLICT",
      "Quota reservation does not match.",
    )
}
export async function startPaymentNotificationDispatch(
  db: PrismaClient,
  raw: {
    tenantId: string
    intentId: string
    claimId: string
    expectedDestination: string
    now?: Date
  },
) {
  const input = z
    .object({
      tenantId: identity,
      intentId: identity,
      claimId: z.string().uuid(),
      expectedDestination: z.string().trim().min(1).max(320),
      now: z.date().optional(),
    })
    .strict()
    .parse(raw)
  return runInOwnTransaction(db, async (tx) => {
    await lockAuthority(tx, input.tenantId)
    let intent = await lockIntent(tx, input.tenantId, input.intentId)
    if (intent.status !== "RESERVED")
      return {
        maySend: false,
        intent,
        destination: null,
        reason: "already_started_or_finished",
      }
    const group = await reportGroup(tx, {
      tenantId: input.tenantId,
      reportId: intent.reportId,
    })
    const state = await loadPaymentNotificationPolicy(tx)
    const { plan } = await getRetailOpsTenantPlan(tx, input)
    const channel = paymentNotificationChannelSchema.parse(intent.channel)
    const config = state.policy.tiers[plan.id][channel]
    const member = group?.members.find(
      (m) =>
        m.id === intent.membershipId && m.userId === intent.recipientUserId,
    )
    const currentChannel = group?.setting.effectiveChannel
    const destination =
      member && group && groupHasContacts(group.members, channel)
        ? paymentAlertDestination(member, channel)
        : null
    if (
      !state.configured ||
      !config.enabled ||
      !group ||
      !destination ||
      destination !== input.expectedDestination ||
      currentChannel !== channel
    ) {
      await release(tx, intent)
      intent = await tx.paymentNotificationIntent.update({
        where: { id: intent.id },
        data: { status: "CANCELLED" },
      })
      return {
        maySend: false,
        intent,
        destination: null,
        reason: "eligibility_changed",
      }
    }
    // Before I/O, move an unstarted reservation into this admission month atomically.
    const periodStart = new Date(paymentNotificationPeriod(input.now).startsAt)
    if (intent.periodStart.getTime() !== periodStart.getTime()) {
      const waiting = await tx.paymentNotificationIntent.findMany({
        where: {
          tenantId: input.tenantId,
          reportId: intent.reportId,
          channel,
          status: "RESERVED",
          periodStart: { not: periodStart },
        },
      })
      const current = await bucket(tx, input.tenantId, channel, periodStart)
      if (
        !capacity(config.limit, current.used, current.reserved, waiting.length)
      )
        return {
          maySend: false,
          intent,
          destination: null,
          reason: "quota_exhausted",
        }
      for (const row of waiting) await release(tx, row)
      await tx.paymentNotificationQuota.update({
        where: key(input.tenantId, channel, periodStart),
        data: { reserved: { increment: waiting.length } },
      })
      await tx.paymentNotificationIntent.updateMany({
        where: {
          id: { in: waiting.map((row) => row.id) },
          tenantId: input.tenantId,
          status: "RESERVED",
        },
        data: { periodStart },
      })
      intent = await tx.paymentNotificationIntent.findUniqueOrThrow({
        where: { id: intent.id },
      })
    }
    const current = await bucket(
      tx,
      input.tenantId,
      channel,
      intent.periodStart,
    )
    if (!capacity(config.limit, current.used, current.reserved, 0))
      return {
        maySend: false,
        intent,
        destination: null,
        reason: "quota_reduced",
      }
    intent = await tx.paymentNotificationIntent.update({
      where: { id: intent.id },
      data: {
        status: "SENDING",
        claimId: input.claimId,
        sendStartedAt: input.now ?? new Date(),
      },
    })
    return { maySend: true, intent, destination }
  })
}
export async function settlePaymentNotificationDispatch(
  db: PrismaClient,
  raw: {
    tenantId: string
    intentId: string
    claimId: string
    outcome: "accepted" | "rejected" | "unknown"
    providerMessageId?: string
  },
) {
  const input = z
    .object({
      tenantId: identity,
      intentId: identity,
      claimId: z.string().uuid(),
      outcome: z.enum(["accepted", "rejected", "unknown"]),
      providerMessageId: z.string().trim().min(1).max(256).optional(),
    })
    .strict()
    .parse(raw)
  return runInOwnTransaction(db, async (tx) => {
    // Settlement works after a Business is suspended: accounting must still recover the original bucket.
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${input.tenantId} FOR UPDATE`
    const intent = await lockIntent(tx, input.tenantId, input.intentId)
    if (intent.claimId !== input.claimId)
      throw new PaymentNotificationError(
        "CONFLICT",
        "Dispatch claim does not match.",
      )
    if (intent.status === "ACCEPTED" || intent.status === "REJECTED") {
      if (
        (intent.status === "ACCEPTED" && input.outcome === "rejected") ||
        (intent.status === "REJECTED" && input.outcome === "accepted")
      )
        throw new PaymentNotificationError(
          "CONFLICT",
          "Provider outcomes conflict; reconciliation is required.",
        )
      return intent
    }
    if (!["SENDING", "UNKNOWN"].includes(intent.status))
      throw new PaymentNotificationError(
        "CONFLICT",
        "Notification has not started.",
      )
    // UNKNOWN may be reconciled to acceptance, but not blindly released as rejected.
    if (intent.status === "UNKNOWN" && input.outcome === "rejected")
      throw new PaymentNotificationError(
        "CONFLICT",
        "Unknown outcome requires provider reconciliation; capacity is retained.",
      )
    if (input.outcome === "accepted") {
      await release(tx, intent)
      await tx.paymentNotificationQuota.update({
        where: key(intent.tenantId, intent.channel, intent.periodStart),
        data: { used: { increment: 1 } },
      })
    } else if (input.outcome === "rejected") await release(tx, intent)
    return tx.paymentNotificationIntent.update({
      where: { id: intent.id },
      data: {
        status:
          input.outcome === "accepted"
            ? "ACCEPTED"
            : input.outcome === "rejected"
              ? "REJECTED"
              : "UNKNOWN",
        ...(input.providerMessageId
          ? { providerMessageId: input.providerMessageId }
          : {}),
      },
    })
  })
}

/** Explicit retry after definitive nonacceptance only. UNKNOWN/SENDING never enters this path. */
export function retryPaymentNotificationDispatch(
  db: PrismaClient,
  input: {
    tenantId: string
    actorUserId: string
    intentId: string
    now?: Date
  },
) {
  identity.parse(input.actorUserId)
  identity.parse(input.tenantId)
  identity.parse(input.intentId)
  return runInOwnTransaction(db, async (tx) => {
    await lockAuthority(tx, input.tenantId)
    await assertFinanceManager(tx, input)
    const intent = await lockIntent(tx, input.tenantId, input.intentId)
    if (intent.status === "RESERVED") return intent
    if (intent.status !== "REJECTED")
      throw new PaymentNotificationError(
        "CONFLICT",
        "Only a definitively rejected notification can be retried.",
      )
    const group = await reportGroup(tx, {
      tenantId: input.tenantId,
      reportId: intent.reportId,
    })
    const { policy, configured } = await loadPaymentNotificationPolicy(tx)
    const { plan } = await getRetailOpsTenantPlan(tx, input)
    const channel = paymentNotificationChannelSchema.parse(intent.channel)
    const config = policy.tiers[plan.id][channel]
    if (
      !configured ||
      !group ||
      !config.enabled ||
      group.setting.effectiveChannel !== channel ||
      !group.members.some(
        (m) =>
          m.id === intent.membershipId && m.userId === intent.recipientUserId,
      ) ||
      !groupHasContacts(group.members, channel)
    )
      throw new PaymentNotificationError(
        "FORBIDDEN",
        "Current notification eligibility is required.",
      )
    const periodStart = new Date(paymentNotificationPeriod(input.now).startsAt)
    const usage = await bucket(tx, input.tenantId, channel, periodStart)
    if (!capacity(config.limit, usage.used, usage.reserved, 1))
      throw new PaymentNotificationError(
        "CONFLICT",
        "Monthly notification allowance exhausted.",
      )
    await tx.paymentNotificationQuota.update({
      where: key(input.tenantId, channel, periodStart),
      data: { reserved: { increment: 1 } },
    })
    return tx.paymentNotificationIntent.update({
      where: { id: intent.id },
      data: {
        status: "RESERVED",
        periodStart,
        claimId: null,
        sendStartedAt: null,
        providerMessageId: null,
        policyRevision: policy.revision,
      },
    })
  })
}

/** Provider preflight cancellation is safe only before a durable send start. */
export function cancelPaymentNotificationReservation(
  db: PrismaClient,
  input: { tenantId: string; intentId: string },
) {
  identity.parse(input.tenantId)
  identity.parse(input.intentId)
  return runInOwnTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${input.tenantId} FOR UPDATE`
    const intent = await lockIntent(tx, input.tenantId, input.intentId)
    if (intent.status !== "RESERVED") return { cancelled: false, intent }
    await release(tx, intent)
    return {
      cancelled: true,
      intent: await tx.paymentNotificationIntent.update({
        where: { id: intent.id },
        data: { status: "CANCELLED" },
      }),
    }
  })
}
/** A crashed worker consumes its reservation until a provider outcome is reconciled. */
export async function markStalePaymentNotificationsUnknown(
  db: PrismaClient,
  input: { before: Date; limit?: number },
) {
  const before = z.date().parse(input.before)
  if (before.getTime() > Date.now() - 300_000)
    throw new PaymentNotificationError(
      "BAD_REQUEST",
      "Dispatch recovery requires a completed worker timeout.",
    )
  const limit = z
    .number()
    .int()
    .min(1)
    .max(50)
    .parse(input.limit ?? 20)
  const rows = await db.paymentNotificationIntent.findMany({
    where: { status: "SENDING", sendStartedAt: { lt: before } },
    orderBy: { sendStartedAt: "asc" },
    take: limit,
    select: { id: true, tenantId: true },
  })
  let count = 0
  for (const row of rows)
    count += await runInOwnTransaction(db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${row.tenantId} FOR UPDATE`
      const result = await tx.paymentNotificationIntent.updateMany({
        where: {
          id: row.id,
          tenantId: row.tenantId,
          status: "SENDING",
          sendStartedAt: { lt: before },
        },
        data: { status: "UNKNOWN" },
      })
      return result.count
    })
  return { count }
}
