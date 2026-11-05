import { z } from "zod"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  paymentAlertCanReview,
  paymentAlertDestination,
} from "../manual-payment-alert-rules"
import { runInOwnTransaction } from "../own-transaction"
import { PaymentNotificationError } from "./policy"
import { paymentAlertMemberInclude } from "./quota"

/**
 * Merchant-only WhatsApp result of a terminal manual payment review.
 * Recipients are the people whose WhatsApp "payment to check" alert for this
 * report was accepted by the provider, and who still opt in and may review it.
 * Nothing here is ever addressed to the payer.
 */
export type PaymentReportOutcome = "CONFIRMED" | "NOT_RECEIVED"
export const PAYMENT_REPORT_OUTCOME_MAX_AGE_MS = 6 * 60 * 60_000

const identity = z.string().trim().min(1).max(128)

type Db = Prisma.TransactionClient | PrismaClient

async function eligibleOutcomeRecipients(
  tx: Db,
  input: { tenantId: string; reportId: string },
) {
  const report = await tx.manualPaymentReport.findFirst({
    where: {
      id: input.reportId,
      link: { tenantId: input.tenantId, tenant: { isActive: true } },
    },
    select: {
      id: true,
      status: true,
      decisionDigest: true,
      link: {
        select: {
          bankAccountId: true,
          tenant: { select: { dataClassification: true } },
          order: {
            select: {
              storeId: true,
              createdByUserId: true,
              store: {
                select: { status: true, salesRepOrderVisibility: true },
              },
            },
          },
        },
      },
    },
  })
  // QA tenants never get live provider work queued; the job guard repeats this.
  if (
    !report ||
    report.link.tenant.dataClassification !== "LIVE" ||
    report.link.order.store.status !== "ACTIVE"
  )
    return { report: null, recipients: [] }
  const setting = await tx.manualPaymentAlertSetting.findFirst({
    where: { accountId: report.link.bankAccountId, tenantId: input.tenantId },
    select: { channel: true, effectiveChannel: true, recipientUserIds: true },
  })
  if (!setting || (setting.effectiveChannel ?? setting.channel) !== "whatsapp")
    return { report, recipients: [] }
  const alerts = await tx.paymentNotificationIntent.findMany({
    where: {
      tenantId: input.tenantId,
      reportId: report.id,
      channel: "whatsapp",
      status: "ACCEPTED",
      recipientUserId: { in: setting.recipientUserIds },
    },
    select: {
      recipientUserId: true,
      membershipId: true,
      membership: { include: paymentAlertMemberInclude },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  })
  const order = report.link.order
  const recipients = alerts.flatMap((alert) => {
    const member = alert.membership
    if (
      member.userId !== alert.recipientUserId ||
      !paymentAlertCanReview(member, order.storeId) ||
      (["CASHIER", "OPERATOR"].includes(member.role) &&
        order.store.salesRepOrderVisibility !== "ALL_STORE_ORDERS" &&
        order.createdByUserId !== member.userId)
    )
      return []
    const destination = paymentAlertDestination(member, "whatsapp")
    return destination
      ? [
          {
            recipientUserId: alert.recipientUserId,
            membershipId: alert.membershipId,
            destination,
          },
        ]
      : []
  })
  return { report, recipients }
}

/** Called inside the first decision transaction only; replays never reach it. */
export async function reservePaymentReportOutcomeNotificationsInTransaction(
  tx: Prisma.TransactionClient,
  raw: {
    tenantId: string
    reportId: string
    outcome: PaymentReportOutcome
    decisionDigest: string
  },
) {
  const input = z
    .object({
      tenantId: identity,
      reportId: identity,
      outcome: z.enum(["CONFIRMED", "NOT_RECEIVED"]),
      decisionDigest: z.string().min(1).max(256),
    })
    .strict()
    .parse(raw)
  const { recipients } = await eligibleOutcomeRecipients(tx, input)
  const ids: string[] = []
  for (const recipient of recipients) {
    const row = await tx.paymentReportOutcomeNotification.upsert({
      where: {
        tenantId_reportId_recipientUserId: {
          tenantId: input.tenantId,
          reportId: input.reportId,
          recipientUserId: recipient.recipientUserId,
        },
      },
      create: {
        tenantId: input.tenantId,
        reportId: input.reportId,
        recipientUserId: recipient.recipientUserId,
        membershipId: recipient.membershipId,
        outcome: input.outcome,
        decisionDigest: input.decisionDigest,
      },
      update: {},
      select: { id: true, status: true },
    })
    if (row.status === "PENDING") ids.push(row.id)
  }
  return ids
}

/** Read-only content source for a worker; never send authority. */
export async function readPaymentReportOutcomeNotification(
  db: PrismaClient,
  raw: { tenantId: string; notificationId: string },
) {
  const input = z
    .object({ tenantId: identity, notificationId: identity })
    .strict()
    .parse(raw)
  const row = await db.paymentReportOutcomeNotification.findFirst({
    where: {
      id: input.notificationId,
      tenantId: input.tenantId,
      status: "PENDING",
      tenant: { isActive: true },
    },
    select: {
      id: true,
      tenantId: true,
      reportId: true,
      outcome: true,
      decisionDigest: true,
      createdAt: true,
      membership: {
        select: { user: { select: { phone: true, phoneVerifiedAt: true } } },
      },
      report: {
        select: {
          status: true,
          decisionDigest: true,
          payerName: true,
          claimedAmountMinor: true,
          receivedAmountMinor: true,
          receivedAccountId: true,
          decisionNote: true,
          link: {
            select: {
              currencyCode: true,
              tenant: { select: { name: true } },
              order: { select: { orderNumber: true } },
            },
          },
        },
      },
    },
  })
  if (!row) return null
  const receivedAccount = row.report.receivedAccountId
    ? await db.financeAccount.findFirst({
        where: { id: row.report.receivedAccountId },
        select: { name: true },
      })
    : null
  return { ...row, receivedAccountName: receivedAccount?.name ?? null }
}

async function lockNotification(
  tx: Prisma.TransactionClient,
  tenantId: string,
  notificationId: string,
) {
  await tx.$queryRaw`SELECT id FROM "PaymentReportOutcomeNotification" WHERE id=${notificationId} AND "tenantId"=${tenantId} FOR UPDATE`
  const row = await tx.paymentReportOutcomeNotification.findFirst({
    where: { id: notificationId, tenantId },
  })
  if (!row)
    throw new PaymentNotificationError("NOT_FOUND", "Notification unavailable.")
  return row
}

/**
 * Fenced PENDING -> SENDING transition. Rechecks the decision, the alert opt-in,
 * membership, review scope, verified destination, QA classification and age.
 */
export async function startPaymentReportOutcomeDispatch(
  db: PrismaClient,
  raw: {
    tenantId: string
    notificationId: string
    claimId: string
    expectedDestination: string
    now?: Date
  },
) {
  const input = z
    .object({
      tenantId: identity,
      notificationId: identity,
      claimId: z.string().uuid(),
      expectedDestination: z.string().trim().min(1).max(32),
      now: z.date().optional(),
    })
    .strict()
    .parse(raw)
  const now = input.now ?? new Date()
  return runInOwnTransaction(db, async (tx) => {
    const row = await lockNotification(tx, input.tenantId, input.notificationId)
    if (row.status !== "PENDING")
      return { maySend: false, reason: "already_started_or_finished" as const }
    const { report, recipients } = await eligibleOutcomeRecipients(tx, {
      tenantId: input.tenantId,
      reportId: row.reportId,
    })
    const recipient = recipients.find(
      (entry) =>
        entry.recipientUserId === row.recipientUserId &&
        entry.membershipId === row.membershipId,
    )
    if (
      !report ||
      report.status !== row.outcome ||
      report.decisionDigest !== row.decisionDigest ||
      !recipient ||
      recipient.destination !== input.expectedDestination ||
      now.getTime() - row.createdAt.getTime() >
        PAYMENT_REPORT_OUTCOME_MAX_AGE_MS
    ) {
      await tx.paymentReportOutcomeNotification.update({
        where: { id: row.id },
        data: { status: "CANCELLED" },
      })
      return { maySend: false, reason: "eligibility_changed" as const }
    }
    await tx.paymentReportOutcomeNotification.update({
      where: { id: row.id },
      data: { status: "SENDING", claimId: input.claimId, sendStartedAt: now },
    })
    return { maySend: true, reason: null }
  })
}

export async function settlePaymentReportOutcomeDispatch(
  db: PrismaClient,
  raw: {
    tenantId: string
    notificationId: string
    claimId: string
    outcome: "accepted" | "rejected" | "unknown"
    providerMessageId?: string
  },
) {
  const input = z
    .object({
      tenantId: identity,
      notificationId: identity,
      claimId: z.string().uuid(),
      outcome: z.enum(["accepted", "rejected", "unknown"]),
      providerMessageId: z.string().trim().min(1).max(512).optional(),
    })
    .strict()
    .parse(raw)
  return runInOwnTransaction(db, async (tx) => {
    const row = await lockNotification(tx, input.tenantId, input.notificationId)
    if (row.claimId !== input.claimId)
      throw new PaymentNotificationError("CONFLICT", "Dispatch claim changed.")
    const next =
      input.outcome === "accepted"
        ? "ACCEPTED"
        : input.outcome === "rejected"
          ? "REJECTED"
          : "UNKNOWN"
    if (row.status === next) return row
    // Only an in-flight or uncertain send may settle; uncertainty never becomes "rejected".
    if (
      !(
        row.status === "SENDING" ||
        (row.status === "UNKNOWN" && next === "ACCEPTED")
      )
    )
      throw new PaymentNotificationError(
        "CONFLICT",
        "Dispatch is not in flight.",
      )
    return tx.paymentReportOutcomeNotification.update({
      where: { id: row.id },
      data: {
        status: next,
        ...(input.providerMessageId
          ? { providerMessageId: input.providerMessageId }
          : {}),
      },
    })
  })
}

export async function cancelPaymentReportOutcomeNotification(
  db: PrismaClient,
  raw: { tenantId: string; notificationId: string },
) {
  const input = z
    .object({ tenantId: identity, notificationId: identity })
    .strict()
    .parse(raw)
  const result = await db.paymentReportOutcomeNotification.updateMany({
    where: {
      id: input.notificationId,
      tenantId: input.tenantId,
      status: "PENDING",
    },
    data: { status: "CANCELLED" },
  })
  return { cancelled: result.count === 1 }
}

/** Sweep input: due work plus crashed workers (uncertain, never resent). */
export async function duePaymentReportOutcomeNotifications(
  db: PrismaClient,
  input: { now?: Date; limit?: number } = {},
) {
  const now = input.now ?? new Date()
  const limit = z
    .number()
    .int()
    .min(1)
    .max(50)
    .parse(input.limit ?? 20)
  await db.paymentReportOutcomeNotification.updateMany({
    where: {
      status: "SENDING",
      sendStartedAt: { lt: new Date(now.getTime() - 5 * 60_000) },
    },
    data: { status: "UNKNOWN" },
  })
  await db.paymentReportOutcomeNotification.updateMany({
    where: {
      status: "PENDING",
      createdAt: {
        lt: new Date(now.getTime() - PAYMENT_REPORT_OUTCOME_MAX_AGE_MS),
      },
    },
    data: { status: "CANCELLED" },
  })
  return db.paymentReportOutcomeNotification.findMany({
    where: {
      status: "PENDING",
      tenant: { isActive: true },
      // Fresh rows are still being sent by their request.
      createdAt: { lt: new Date(now.getTime() - 2 * 60_000) },
    },
    select: { id: true, tenantId: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  })
}
