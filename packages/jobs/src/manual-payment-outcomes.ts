import { randomUUID } from "node:crypto"
import { prisma } from "@ewatrade/db/client"
import {
  cancelPaymentReportOutcomeNotification,
  duePaymentReportOutcomeNotifications,
  readPaymentReportOutcomeNotification,
  settlePaymentReportOutcomeDispatch,
  startPaymentReportOutcomeDispatch,
} from "@ewatrade/db/payment-report-notifications"
import { manualPaymentReportStatus } from "@ewatrade/db/queries"
import {
  type PaymentReportOutcomeClaim,
  type PaymentReportOutcomeIdentifier,
  createPaymentReportOutcomeProvider,
  paymentReportOutcomesEnabled,
  runPaymentReportOutcomeDispatch,
} from "./handlers/manual-payment-outcome-dispatch"
import { assertQaJobProviderAllowed } from "./qa-provider-guard"
import { triggerJob } from "./trigger"

export { paymentReportOutcomesEnabled }

/** ID-only durable worker; content is derived again from the decided report. */
export async function manualPaymentOutcomeDispatchHandler(
  input: PaymentReportOutcomeIdentifier,
) {
  if (!paymentReportOutcomesEnabled()) return { enabled: false }
  return runPaymentReportOutcomeDispatch(input, {
    claim: async ({ tenantId, notificationId }) => {
      const row = await readPaymentReportOutcomeNotification(prisma, {
        tenantId,
        notificationId,
      })
      if (!row) return null
      const user = row.membership.user
      const destination = user.phoneVerifiedAt ? user.phone?.trim() : null
      if (
        !destination ||
        row.report.status !== row.outcome ||
        row.report.decisionDigest !== row.decisionDigest ||
        (row.outcome !== "CONFIRMED" && row.outcome !== "NOT_RECEIVED")
      ) {
        await cancelPaymentReportOutcomeNotification(prisma, {
          tenantId,
          notificationId,
        })
        return null
      }
      const status = await manualPaymentReportStatus(prisma, row.reportId)
      return {
        tenantId,
        notificationId,
        claimId: randomUUID(),
        destination,
        content: {
          reportId: row.reportId,
          businessName: row.report.link.tenant.name,
          orderNumber: row.report.link.order.orderNumber,
          outcome: row.outcome,
          payerName: row.report.payerName,
          currencyCode: row.report.link.currencyCode,
          claimedAmountMinor: row.report.claimedAmountMinor,
          receivedAmountMinor: row.report.receivedAmountMinor,
          balanceMinor: status.balanceMinor,
          receivedAccountName: row.receivedAccountName,
          reason: row.report.decisionNote,
        },
      } satisfies PaymentReportOutcomeClaim
    },
    start: async (claim) =>
      (
        await startPaymentReportOutcomeDispatch(prisma, {
          tenantId: claim.tenantId,
          notificationId: claim.notificationId,
          claimId: claim.claimId,
          expectedDestination: claim.destination,
        })
      ).maySend,
    finish: async (claim) =>
      claim.outcome === "cancelled"
        ? cancelPaymentReportOutcomeNotification(prisma, {
            tenantId: claim.tenantId,
            notificationId: claim.notificationId,
          })
        : settlePaymentReportOutcomeDispatch(prisma, {
            tenantId: claim.tenantId,
            notificationId: claim.notificationId,
            claimId: claim.claimId,
            outcome: claim.outcome,
            ...(claim.providerMessageId
              ? { providerMessageId: claim.providerMessageId }
              : {}),
          }),
    ...createPaymentReportOutcomeProvider({
      env: process.env,
      assertProviderAllowed: assertQaJobProviderAllowed,
    }),
  })
}

export async function enqueueManualPaymentOutcomes(input: {
  tenantId: string
  notificationIds: string[]
}) {
  if (!paymentReportOutcomesEnabled() || !input.notificationIds.length)
    return { queued: 0 }
  const results = await Promise.allSettled(
    input.notificationIds.map((notificationId) =>
      triggerJob(
        "manual-payment.outcome-dispatch",
        async (payload) => {
          await manualPaymentOutcomeDispatchHandler(payload)
        },
        { tenantId: input.tenantId, notificationId },
        { maxAttempts: 1 },
      ),
    ),
  )
  return { queued: results.filter((r) => r.status === "fulfilled").length }
}

/** Recovers lost enqueues; never resends a started or finished notification. */
export async function runManualPaymentOutcomeSweep() {
  if (!paymentReportOutcomesEnabled()) return { enabled: false, queued: 0 }
  const due = await duePaymentReportOutcomeNotifications(prisma, { limit: 20 })
  let queued = 0
  for (const row of due)
    queued += (
      await enqueueManualPaymentOutcomes({
        tenantId: row.tenantId,
        notificationIds: [row.id],
      })
    ).queued
  return { queued }
}
