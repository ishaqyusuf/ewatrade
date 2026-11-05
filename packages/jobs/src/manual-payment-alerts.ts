import { randomUUID } from "node:crypto"
import { prisma } from "@ewatrade/db/client"
import {
  cancelPaymentNotificationReservation,
  claimPaymentNotificationPolicyChange,
  markStalePaymentNotificationsUnknown,
  processPaymentNotificationPolicyChange,
  settlePaymentNotificationDispatch,
  startPaymentNotificationDispatch,
} from "@ewatrade/db/payment-report-notifications"
import {
  manualPaymentReportReviewUrl,
  resendEmailTransport,
} from "@ewatrade/email"
import {
  type ManualPaymentAlertDispatchClaim,
  type ManualPaymentAlertIdentifier,
  runManualPaymentAlertDispatch,
} from "./handlers/manual-payment-alert-dispatch"
import {
  runManualPaymentAlertJobs,
  runManualPaymentPolicyChange,
} from "./handlers/manual-payment-alert-jobs"
import {
  createManualPaymentAlertProvider,
  manualPaymentAlertsEnabled,
} from "./handlers/manual-payment-alert-provider"
import { assertQaJobProviderAllowed } from "./qa-provider-guard"
import { triggerJob } from "./trigger"

/** ID-only durable worker; provider content is derived again from current records. */
export async function manualPaymentAlertDispatchHandler(
  input: ManualPaymentAlertIdentifier,
) {
  if (!manualPaymentAlertsEnabled()) return { enabled: false }
  return runManualPaymentAlertDispatch(input, {
    claim: async ({ tenantId, intentId }) => {
      const row = await prisma.paymentNotificationIntent.findFirst({
        where: {
          id: intentId,
          tenantId,
          status: "RESERVED",
          tenant: { isActive: true },
        },
        include: {
          membership: {
            select: {
              user: {
                select: {
                  email: true,
                  emailVerified: true,
                  phone: true,
                  phoneVerifiedAt: true,
                },
              },
            },
          },
          report: {
            include: {
              link: {
                include: {
                  tenant: { select: { name: true } },
                  order: { select: { orderNumber: true } },
                  bankAccount: { select: { name: true } },
                },
              },
            },
          },
        },
      })
      if (!row || (row.channel !== "email" && row.channel !== "whatsapp"))
        return null
      const user = row.membership.user
      const destination = row.channel === "email" ? user.email : user.phone
      const origin = process.env.NEXT_PUBLIC_DASHBOARD_URL
      if (!destination || !origin) {
        await cancelPaymentNotificationReservation(prisma, {
          tenantId,
          intentId,
        })
        return null
      }
      let reviewUrl: string
      try {
        reviewUrl = manualPaymentReportReviewUrl(origin, row.reportId)
      } catch {
        await cancelPaymentNotificationReservation(prisma, {
          tenantId,
          intentId,
        })
        return null
      }
      return {
        tenantId,
        intentId,
        claimId: randomUUID(),
        channel: row.channel,
        destination,
        providerIdempotencyKey: `manual-payment-alert:${row.id}`,
        content: {
          businessName: row.report.link.tenant.name,
          payerName: row.report.payerName,
          amountMinor: row.report.claimedAmountMinor,
          currencyCode: row.report.link.currencyCode,
          orderNumber: row.report.link.order.orderNumber,
          bankAccountName: row.report.link.bankAccount.name,
          reportedAt: (
            row.report.submittedAt ?? row.report.createdAt
          ).toISOString(),
          reviewUrl,
        },
      } satisfies ManualPaymentAlertDispatchClaim
    },
    start: async (claim) =>
      (
        await startPaymentNotificationDispatch(prisma, {
          tenantId: claim.tenantId,
          intentId: claim.intentId,
          claimId: claim.claimId,
          expectedDestination: claim.destination,
        })
      ).maySend,
    finish: async (claim) =>
      claim.outcome === "cancelled"
        ? cancelPaymentNotificationReservation(prisma, {
            tenantId: claim.tenantId,
            intentId: claim.intentId,
          })
        : settlePaymentNotificationDispatch(prisma, {
            tenantId: claim.tenantId,
            intentId: claim.intentId,
            claimId: claim.claimId,
            outcome: claim.outcome,
            ...(claim.providerMessageId
              ? { providerMessageId: claim.providerMessageId }
              : {}),
          }),
    ...createManualPaymentAlertProvider({
      env: process.env,
      email: resendEmailTransport,
      assertProviderAllowed: assertQaJobProviderAllowed,
    }),
  })
}

/**
 * Sends each payment alert in the calling process: the infra budget allows no
 * Trigger run per report. The start fence keeps a racing sweep from sending
 * twice; anything left RESERVED goes out with the cadence sweep.
 */
export async function sendManualPaymentAlerts(input: {
  tenantId: string
  intentIds: string[]
}) {
  if (!manualPaymentAlertsEnabled() || !input.intentIds.length)
    return { sent: 0 }
  const results = await Promise.allSettled(
    input.intentIds.map((intentId) =>
      manualPaymentAlertDispatchHandler({ tenantId: input.tenantId, intentId }),
    ),
  )
  return { sent: results.filter((r) => r.status === "fulfilled").length }
}

/** Existing cadence safety net, no scan/resend of old reports or completed intents. */
export async function runManualPaymentAlertSweep() {
  return runManualPaymentAlertJobs({
    externalDeliveryEnabled: manualPaymentAlertsEnabled(),
    queuePolicyChange: async () => {
      const change = await prisma.paymentNotificationPolicyChange.findFirst({
        where: { status: { not: "COMPLETED" } },
        select: { revision: true },
        orderBy: { revision: "asc" },
      })
      if (change)
        await triggerJob(
          "manual-payment.policy-change",
          async (payload: { revision?: number; claimId?: string }) => {
            await manualPaymentPolicyChangeHandler(payload)
          },
          {},
          { maxAttempts: 1 },
        )
      return !!change
    },
    queueExternalAlerts: async () => {
      // A killed worker is uncertain, never a new send opportunity; keep capacity.
      await markStalePaymentNotificationsUnknown(prisma, {
        before: new Date(Date.now() - 5 * 60_000),
        limit: 20,
      })
      const due = await prisma.paymentNotificationIntent.findMany({
        where: {
          status: "RESERVED",
          tenant: { isActive: true },
          // Fresh intents are still being sent by their request.
          createdAt: { lt: new Date(Date.now() - 2 * 60_000) },
        },
        select: { id: true, tenantId: true },
        orderBy: { createdAt: "asc" },
        take: 50,
      })
      const results = await Promise.allSettled(
        due.map((row) =>
          sendManualPaymentAlerts({
            tenantId: row.tenantId,
            intentIds: [row.id],
          }),
        ),
      )
      return results.reduce(
        (count, result) =>
          count + (result.status === "fulfilled" ? result.value.sent : 0),
        0,
      )
    },
  })
}

/** Bounded continuation chain only while a committed revision has real work. */
export async function manualPaymentPolicyChangeHandler(input: {
  revision?: number
  claimId?: string
}) {
  return runManualPaymentPolicyChange(input, {
    claim: () => claimPaymentNotificationPolicyChange(prisma),
    process: (claim) => processPaymentNotificationPolicyChange(prisma, claim),
    continue: (claim) =>
      triggerJob(
        "manual-payment.policy-change",
        async (payload) => {
          await manualPaymentPolicyChangeHandler(payload)
        },
        claim,
        { maxAttempts: 1 },
      ),
  })
}
