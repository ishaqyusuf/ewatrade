import { authorizeMerchantReceiptAssessmentRetry } from "@ewatrade/db/manual-payment-assessments"
import {
  PaymentNotificationError,
  countPaymentNotificationChanges,
  listPaymentNotificationChanges,
  markPaymentNotificationChangesRead,
  paymentNotificationEligibility,
  retryPaymentNotificationDispatch,
} from "@ewatrade/db/payment-report-notifications"
import {
  CatalogError,
  FinanceError,
  cancelManualPaymentReportDraft,
  countPendingManualPaymentReportBadge,
  createBusinessPaymentLink,
  createManualBankAccount,
  effectiveCommercialAmountPaid,
  getBusinessPaymentLink,
  listManualBankAccounts,
  manualPaymentLinkCandidates,
  manualPaymentReportStatus,
  nextManualPaymentAttempt,
  pendingManualPaymentReports,
  prepareManualPaymentReport,
  readManualPaymentReport,
  readManualPaymentReportFundsReview,
  readOrderManualPaymentCustomerFunds,
  reviewManualPaymentReport,
  saveManualBankDetails,
  shortManualPaymentLinkIdentity,
  submitManualPaymentReport,
} from "@ewatrade/db/queries"
import {
  manualPaymentAlertDeliveries,
  readManualPaymentAlertSettings,
} from "@ewatrade/db/queries"
import {
  paymentReportOutcomesEnabled,
  sendManualPaymentAlerts,
  sendManualPaymentOutcomes,
} from "@ewatrade/jobs"
import {
  createPaymentLinkToken,
  paymentLinkPreview,
  paymentLinkSharing,
  paymentLinkUrl,
} from "@ewatrade/payments"
import {
  ManualPaymentError,
  manualPaymentShortCode,
} from "@ewatrade/utils/manual-payments"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { paymentLinkOrigin, paymentLinkSigningKey } from "../../banking/config"
import { retryManualReceiptAssessment } from "../../banking/manual-payment-assessments"
import {
  applyManualPaymentCustomerFunds,
  manualPaymentCustomerSessionPrincipal,
  readManualPaymentCustomerFunds,
} from "../../banking/manual-payment-customer-funds"
import {
  isManualPaymentFinanceReviewer,
  projectMerchantPaymentFundsReview,
} from "../../banking/manual-payment-merchant-review"
import {
  manualReportIdentity,
  resolveManualLinkIdentity,
} from "../../banking/manual-payment-tokens"
import {
  manualPaymentStatusSocketUrl,
  publishManualPaymentStatus,
} from "../../banking/status-socket"
import {
  applyManualCustomerCreditSchema,
  cancelManualPaymentDraftSchema,
  createBusinessPaymentLinkSchema,
  createManualBankAccountSchema,
  manualBankDetailsSchema,
  manualReportIdSchema,
  manualReportPageSchema,
  manualReportTokenSchema,
  nextManualPaymentAttemptSchema,
  prepareManualPaymentReportSchema,
  publicBusinessPaymentLinkSchema,
  reviewManualPaymentReportSchema,
} from "../../schemas/business-banking"
import { financeProcedure } from "../finance-procedure"
import {
  type TRPCContext,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../init"
import { orderScope } from "../order-scope"
import { assertCanOperateOrders, orderError } from "./orders"

async function mapped<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof PaymentNotificationError)
      throw new TRPCError({
        code: error.code === "UNAVAILABLE" ? "PRECONDITION_FAILED" : error.code,
        message: error.message,
      })
    if (error instanceof ManualPaymentError)
      throw new TRPCError({ code: error.code, message: error.message })
    if (error instanceof CatalogError || error instanceof FinanceError)
      throw orderError(error)
    throw error
  }
}
const actor = (ctx: {
  tenantContext: { tenant: { id: string } }
  session: { user: { id: string } }
}) => ({
  tenantId: ctx.tenantContext.tenant.id,
  actorUserId: ctx.session.user.id,
})

async function prepareReport(
  ctx: TRPCContext,
  input: z.infer<typeof prepareManualPaymentReportSchema>,
  withRefund: boolean,
) {
  const secret = paymentLinkSigningKey()
  const principal = manualPaymentCustomerSessionPrincipal(ctx)
  if (withRefund) {
    if (
      !input.allocation?.refundDestination ||
      input.allocation.allocationPreference !== "REFUND"
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Review the refund destination before submitting this report.",
      })
    if (!principal.authenticatedUserId || !principal.authenticatedSessionId)
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Verify this customer's account before adding refund details.",
      })
  } else if (input.allocation?.refundDestination) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Use the verified refund report to submit bank details.",
    })
  }
  const identity = await resolveManualLinkIdentity(input.token, {
    readShortLink: (code) => shortManualPaymentLinkIdentity(ctx.db, code),
  })
  const result = await mapped(() =>
    prepareManualPaymentReport(ctx.db, {
      ...input,
      ...identity,
      ...principal,
      destinationEncryptionKey: process.env.CUSTOMER_FUNDS_DESTINATION_KEY,
    }),
  )
  const reportToken = createPaymentLinkToken(
    {
      intentId: result.report.id,
      expiresAt: new Date(result.report.createdAt.getTime() + 7 * 86400_000),
    },
    secret,
    "manual-report",
  )
  return {
    reportId: result.report.id,
    reportToken,
    status: result.report.status,
    revision: result.report.revision,
    draftCancelledAt: result.report.draftCancelledAt,
    paymentReference: result.paymentReference,
    paymentAttemptId: result.report.attemptId,
    replay: result.replay,
    receiptUploadPath: input.receipt
      ? `/api/manual-payments/reports/${result.report.id}/receipt`
      : null,
  }
}

export const businessBankingRouter = createTRPCRouter({
  retryAlert: financeProcedure
    .input(
      z
        .object({
          reportId: z.string().min(1).max(128),
          recipientUserId: z.string().min(1).max(128),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) =>
      mapped(async () => {
        if (process.env.PAYMENT_REPORT_ALERTS_ENABLED !== "true")
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Payment alert delivery is unavailable.",
          })
        await readManualPaymentReport(ctx.db, {
          reportId: input.reportId,
          scope: await orderScope(ctx),
        })
        const intent = await ctx.db.paymentNotificationIntent.findFirst({
          where: {
            tenantId: ctx.tenantContext.tenant.id,
            reportId: input.reportId,
            recipientUserId: input.recipientUserId,
          },
          select: { id: true },
        })
        if (!intent)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Payment alert not found.",
          })
        const retried = await retryPaymentNotificationDispatch(ctx.db, {
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
          intentId: intent.id,
        })
        await sendManualPaymentAlerts({
          tenantId: ctx.tenantContext.tenant.id,
          intentIds: [retried.id],
        })
        return { queued: true }
      }),
    ),
  notificationChangeCount: protectedProcedure
    .input(z.void())
    .query(({ ctx }) =>
      mapped(() => countPaymentNotificationChanges(ctx.db, actor(ctx))),
    ),
  notificationChanges: protectedProcedure
    .input(manualReportPageSchema)
    .query(({ ctx, input }) =>
      mapped(() =>
        listPaymentNotificationChanges(ctx.db, { ...actor(ctx), ...input }),
      ),
    ),
  markNotificationChangesRead: protectedProcedure
    .input(
      z
        .object({ ids: z.array(z.string().min(1).max(128)).min(1).max(50) })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      mapped(() =>
        markPaymentNotificationChangesRead(ctx.db, { ...actor(ctx), ...input }),
      ),
    ),
  notificationEligibility: financeProcedure.query(({ ctx }) =>
    mapped(() => paymentNotificationEligibility(ctx.db, actor(ctx))),
  ),
  notificationSettings: financeProcedure
    .input(
      z
        .object({
          bookId: z.string().min(1).max(128),
          accountId: z.string().min(1).max(128).optional(),
        })
        .strict(),
    )
    .query(({ ctx, input }) =>
      mapped(() =>
        readManualPaymentAlertSettings(ctx.db, { ...actor(ctx), ...input }),
      ),
    ),
  linkCandidates: protectedProcedure
    .input(
      z
        .object({
          period: z.enum(["today", "all"]).default("all"),
          query: z.string().trim().min(1).max(160).optional(),
          beforeId: z.string().min(1).max(128).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      return mapped(async () =>
        manualPaymentLinkCandidates(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          scope: await orderScope(ctx),
        }),
      )
    }),
  orderCustomerFunds: financeProcedure
    .input(z.object({ orderId: z.string().min(1).max(128) }).strict())
    .query(({ ctx, input }) =>
      mapped(() =>
        readOrderManualPaymentCustomerFunds(ctx.db, {
          ...actor(ctx),
          orderId: input.orderId,
        }),
      ),
    ),
  availability: protectedProcedure.query(() => ({
    mode: "manual" as const,
    enabled: true,
    automatedPayments: false,
  })),
  accounts: financeProcedure
    .input(z.object({ bookId: z.string().min(1).max(128) }).strict())
    .query(({ ctx, input }) =>
      mapped(() => listManualBankAccounts(ctx.db, { ...actor(ctx), ...input })),
    ),
  createBankAccount: financeProcedure
    .input(createManualBankAccountSchema)
    .mutation(({ ctx, input }) =>
      mapped(() =>
        createManualBankAccount(ctx.db, { ...actor(ctx), ...input }),
      ),
    ),
  saveBankDetails: financeProcedure
    .input(manualBankDetailsSchema)
    .mutation(({ ctx, input }) =>
      mapped(() => saveManualBankDetails(ctx.db, { ...actor(ctx), ...input })),
    ),
  createPaymentLink: protectedProcedure
    .input(createBusinessPaymentLinkSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const secret = paymentLinkSigningKey()
      const origin = paymentLinkOrigin()
      paymentLinkUrl(origin, "configuration-check")
      const order = await ctx.db.commercialOrder.findFirst({
        where: { ...(await orderScope(ctx)), id: input.orderId },
        select: {
          storeId: true,
          orderNumber: true,
          customerPhone: true,
          store: { select: { name: true } },
        },
      })
      if (!order)
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." })
      const now = new Date()
      const result = await mapped(() =>
        createBusinessPaymentLink(ctx.db, {
          ...input,
          ...actor(ctx),
          storeId: order.storeId,
          now,
          expiresAt: new Date(now.getTime() + input.lifetimeMinutes * 60_000),
        }),
      )
      const token =
        manualPaymentShortCode(result.link.id) ??
        createPaymentLinkToken(
          { intentId: result.link.id, expiresAt: result.link.expiresAt },
          secret,
        )
      const url = paymentLinkUrl(origin, token)
      const sharing = paymentLinkSharing({
        phone: order.customerPhone,
        businessName: order.store.name,
        orderNumber: order.orderNumber,
        url,
        amountMinor: result.attemptAmounts.remainingTransferMinor,
        currencyCode: result.link.currencyCode,
      })
      const referenceText = `Payment reference: ${result.attempt.paymentReference}`
      sharing.copyText = `${sharing.copyText}\n${referenceText}`
      if (sharing.whatsappUrl) {
        const destination = new URL(sharing.whatsappUrl)
        destination.searchParams.set("text", sharing.copyText)
        sharing.whatsappUrl = destination.href
      }
      return {
        url,
        ...sharing,
        expiresAt: result.link.expiresAt,
        amountMinor: result.attemptAmounts.remainingTransferMinor,
        amountRequestedMinor: result.link.amountMinor,
        ...result.attemptAmounts,
        currencyCode: result.link.currencyCode,
        allowPartial: result.link.allowPartial,
        replay: result.replay,
        paymentReference: result.attempt.paymentReference,
        paymentAttemptId: result.attempt.id,
      }
    }),
  customerFunds: publicProcedure
    .input(publicBusinessPaymentLinkSchema)
    .query(({ ctx, input }) =>
      mapped(() => readManualPaymentCustomerFunds(ctx, input.token)),
    ),
  applyCustomerCredit: publicProcedure
    .input(applyManualCustomerCreditSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await mapped(() =>
        applyManualPaymentCustomerFunds(ctx, input),
      )
      return result
    }),
  retryReportReceiptAssessment: financeProcedure
    .input(manualReportIdSchema)
    .mutation(async ({ ctx, input }) => {
      await mapped(async () =>
        readManualPaymentReport(ctx.db, {
          reportId: input.reportId,
          scope: await orderScope(ctx),
        }),
      )
      await mapped(() =>
        authorizeMerchantReceiptAssessmentRetry(ctx.db, {
          ...actor(ctx),
          reportId: input.reportId,
        }),
      )
      await mapped(() => retryManualReceiptAssessment(input.reportId))
      return mapped(() => manualPaymentReportStatus(ctx.db, input.reportId))
    }),
  retryReceiptAssessment: publicProcedure
    .input(manualReportTokenSchema)
    .mutation(async ({ ctx, input }) => {
      const proof = manualReportIdentity(input.reportToken)
      await mapped(() => retryManualReceiptAssessment(proof.reportId))
      return mapped(() => manualPaymentReportStatus(ctx.db, proof.reportId))
    }),
  paymentLink: publicProcedure
    .input(publicBusinessPaymentLinkSchema)
    .query(async ({ ctx, input }) => {
      const identity = await resolveManualLinkIdentity(input.token, {
        allowExpired: true,
        readShortLink: (code) => shortManualPaymentLinkIdentity(ctx.db, code),
      })
      const page = await mapped(() =>
        getBusinessPaymentLink(ctx.db, {
          ...identity,
          now: new Date(),
        }),
      )
      return { ...page, preview: paymentLinkPreview(page.businessName) }
    }),
  nextPaymentAttempt: publicProcedure
    .input(nextManualPaymentAttemptSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await mapped(() =>
        nextManualPaymentAttempt(ctx.db, {
          ...manualReportIdentity(input.reportToken),
          clientAttemptId: input.clientAttemptId,
        }),
      )
      return {
        paymentAttemptId: result.attempt.id,
        paymentReference: result.attempt.paymentReference,
        replay: result.replay,
      }
    }),
  reportPayment: publicProcedure
    .input(prepareManualPaymentReportSchema)
    .mutation(({ ctx, input }) => prepareReport(ctx, input, false)),
  reportPaymentWithRefund: publicProcedure
    .input(prepareManualPaymentReportSchema)
    .mutation(({ ctx, input }) => prepareReport(ctx, input, true)),
  cancelDraftReport: publicProcedure
    .input(cancelManualPaymentDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const proof = manualReportIdentity(input.reportToken)
      const result = await mapped(() =>
        cancelManualPaymentReportDraft(ctx.db, {
          ...proof,
          expectedRevision: input.expectedRevision,
        }),
      )
      return { ...result, state: "draft_cancelled" as const }
    }),
  submitReport: publicProcedure
    .input(manualReportTokenSchema)
    .mutation(async ({ ctx, input }) => {
      const proof = manualReportIdentity(input.reportToken)
      const submission = await mapped(() =>
        submitManualPaymentReport(ctx.db, {
          ...proof,
          notificationDeliveryEnabled:
            process.env.PAYMENT_REPORT_ALERTS_ENABLED === "true",
        }),
      )
      await sendManualPaymentAlerts({
        tenantId: submission.notificationTenantId,
        intentIds: submission.notificationIntentIds,
      })
      await publishManualPaymentStatus(proof.reportId)
      return mapped(() => manualPaymentReportStatus(ctx.db, proof.reportId))
    }),
  reportStatus: publicProcedure
    .input(manualReportTokenSchema)
    .query(async ({ ctx, input }) => ({
      ...(await mapped(() =>
        manualPaymentReportStatus(
          ctx.db,
          manualReportIdentity(input.reportToken).reportId,
        ),
      )),
      statusSocketUrl: manualPaymentStatusSocketUrl(),
    })),
  pendingReportCount: protectedProcedure
    .input(z.void())
    .query(async ({ ctx }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      return mapped(async () =>
        countPendingManualPaymentReportBadge(ctx.db, await orderScope(ctx)),
      )
    }),
  pendingReports: protectedProcedure
    .input(manualReportPageSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      return mapped(async () =>
        pendingManualPaymentReports(ctx.db, {
          ...input,
          scope: await orderScope(ctx),
        }),
      )
    }),
  report: protectedProcedure
    .input(manualReportIdSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const row = await mapped(async () =>
        readManualPaymentReport(ctx.db, {
          ...input,
          scope: await orderScope(ctx),
        }),
      )
      const paidMinor = effectiveCommercialAmountPaid({
        ...row.link.order,
        paymentCount: row.link.order._count.payments,
      })
      const fundsReview = await projectMerchantPaymentFundsReview(
        ctx.tenantContext.membership.role,
        () =>
          readManualPaymentReportFundsReview(ctx.db, {
            ...actor(ctx),
            reportId: row.id,
          }),
      )
      const finance = isManualPaymentFinanceReviewer(
        ctx.tenantContext.membership.role,
      )
      return {
        reportId: row.id,
        alertDeliveries: await manualPaymentAlertDeliveries(ctx.db, {
          tenantId: ctx.tenantContext.tenant.id,
          reportId: row.id,
          storeId: row.link.order.storeId,
          allowRetry:
            ["OWNER", "ADMIN"].includes(ctx.tenantContext.membership.role) &&
            process.env.PAYMENT_REPORT_ALERTS_ENABLED === "true",
        }),
        revision: row.revision,
        draftCancelledAt: row.draftCancelledAt,
        status: row.status,
        payerName: row.payerName,
        claimedAmountMinor: row.claimedAmountMinor,
        receivedAmountMinor: row.receivedAmountMinor,
        submittedAt: row.submittedAt,
        decidedAt: row.decidedAt,
        receivedAt: row.receivedAt,
        decisionNote: row.decisionNote,
        bankReference: row.bankReference,
        paymentReference: row.attempt?.paymentReference ?? null,
        paymentAttemptId: row.attemptId,
        requestedAmountMinor: row.link.amountMinor,
        verification: row.verification,
        confirmedAllocation: row.confirmedAllocation,
        receiptAssessment: row.receiptAssessment,
        receiptExtraction: row.receiptExtraction,
        allocationPreference: row.allocationPreference,
        requestedApplyMinor: row.requestedApplyMinor?.toString() ?? null,
        customerReceiptId: finance ? row.customerReceiptId : null,
        customerCreditEntryId: finance ? row.customerCreditEntryId : null,
        customerFundsRefundRequestId: finance
          ? row.customerFundsRefundRequestId
          : null,
        ...fundsReview,
        receivedAccountId: row.receivedAccountId,
        currencyCode: row.link.currencyCode,
        orderId: row.link.orderId,
        orderNumber: row.link.order.orderNumber,
        totalMinor: row.link.order.totalMinor,
        paidMinor,
        balanceMinor: Math.max(0, row.link.order.totalMinor - paidMinor),
        bankAccountId: row.link.bankAccountId,
        bank: {
          name: row.link.bankName,
          accountHolder: row.link.bankAccountHolder,
          accountNumber: row.link.bankAccountNumber,
        },
        receiptPath: row.receiptUploadedAt
          ? `/api/manual-payments/reports/${row.id}/receipt`
          : null,
        receiptContentType: row.receiptContentType,
        receiptSizeBytes: row.receiptSizeBytes,
      }
    }),
  reviewReport: protectedProcedure
    .input(reviewManualPaymentReportSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      // The ordinary visibility check is repeated before canonical in-transaction authority.
      const original = await mapped(async () =>
        readManualPaymentReport(ctx.db, {
          reportId: input.reportId,
          scope: await orderScope(ctx),
        }),
      )
      const result = await mapped(() =>
        reviewManualPaymentReport(ctx.db, {
          ...input,
          ...actor(ctx),
          destinationEncryptionKey: process.env.CUSTOMER_FUNDS_DESTINATION_KEY,
          outcomeNotificationEnabled: paymentReportOutcomesEnabled(),
        }),
      )
      // Merchant-only WhatsApp result; sent after commit, never to the payer.
      await sendManualPaymentOutcomes({
        tenantId: ctx.tenantContext.tenant.id,
        notificationIds: result.outcomeNotificationIds,
      }).catch(() => undefined)
      await publishManualPaymentStatus(result.report.id)
      const status = await mapped(() =>
        manualPaymentReportStatus(ctx.db, result.report.id),
      )
      const copyText = status.message
      let whatsappUrl: string | null = null
      const phone = original.link.order.customerPhone?.replace(/[\s()+-]/g, "")
      if (phone && /^[1-9]\d{7,14}$/.test(phone))
        whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(copyText)}`
      return { ...status, replay: result.replay, copyText, whatsappUrl }
    }),
})
