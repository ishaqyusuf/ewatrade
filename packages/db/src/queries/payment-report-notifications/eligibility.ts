import {
  type PaymentReportNotificationEligibility,
  paymentNotificationChannelEligibility,
  type paymentNotificationChannels,
  paymentNotificationPeriod,
} from "@ewatrade/utils/payment-report-notification-policy"
import type { PrismaClient } from "../../../generated/prisma/client"
import { assertFinanceManager } from "../finance/access"
import { runInOwnTransaction } from "../own-transaction"
import { getRetailOpsTenantPlan } from "../retail-ops-subscriptions"
import type { DbClient } from "../types"
import {
  PaymentNotificationError,
  loadPaymentNotificationPolicy,
} from "./policy"

export async function readPaymentReportNotificationEligibility(
  db: DbClient,
  input: { tenantId: string; now?: Date },
): Promise<PaymentReportNotificationEligibility> {
  const period = paymentNotificationPeriod(input.now)
  const tenant = await db.tenant.findFirst({
    where: { id: input.tenantId, isActive: true },
    select: { id: true },
  })
  if (!tenant)
    throw new PaymentNotificationError("NOT_FOUND", "Business unavailable.")
  try {
    const [{ policy, configured }, { plan }, usage] = await Promise.all([
      loadPaymentNotificationPolicy(db),
      getRetailOpsTenantPlan(db, { tenantId: tenant.id }),
      db.paymentNotificationQuota.findMany({
        where: { tenantId: tenant.id, periodStart: new Date(period.startsAt) },
      }),
    ])
    const channel = (c: (typeof paymentNotificationChannels)[number]) => {
      const bucket = usage.find((r) => r.channel === c)
      return paymentNotificationChannelEligibility({
        policy,
        planId: plan.id,
        channel: c,
        used: bucket?.used ?? 0,
        reserved: bucket?.reserved ?? 0,
        ...(!configured
          ? { unavailableReason: "policy_missing" as const }
          : {}),
      })
    }
    return {
      schemaVersion: 1,
      scope: "payment_report",
      policyRevision: configured ? policy.revision : null,
      planId: plan.id,
      period,
      channels: { email: channel("email"), whatsapp: channel("whatsapp") },
    }
  } catch (error) {
    const reason =
      error instanceof PaymentNotificationError
        ? "policy_invalid"
        : "unavailable"
    const channel = paymentNotificationChannelEligibility({
      policy: null,
      planId: null,
      channel: "email",
      used: null,
      reserved: null,
      unavailableReason: reason,
    })
    return {
      schemaVersion: 1,
      scope: "payment_report",
      policyRevision: null,
      planId: null,
      period,
      channels: { email: channel, whatsapp: { ...channel } },
    }
  }
}
export function paymentNotificationEligibility(
  db: PrismaClient,
  input: { tenantId: string; actorUserId: string; now?: Date },
) {
  return runInOwnTransaction(db, async (tx) => {
    await assertFinanceManager(tx, input)
    return readPaymentReportNotificationEligibility(tx, input)
  })
}
export async function paymentNotificationBusinesses(
  db: DbClient,
  input: { cursor?: string; search?: string } = {},
) {
  const rows = await db.tenant.findMany({
    where: {
      isActive: true,
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
    },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
    take: 51,
  })
  return {
    businesses: rows.slice(0, 50),
    nextCursor: rows.length > 50 ? (rows[49]?.id ?? null) : null,
  }
}
