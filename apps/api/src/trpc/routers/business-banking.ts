import {
  CatalogError,
  FinanceError,
  createBusinessPaymentLink,
  createManualBankAccount,
  effectiveCommercialAmountPaid,
  getBusinessPaymentLink,
  listManualBankAccounts,
  manualPaymentLinkCandidates,
  manualPaymentReportStatus,
  pendingManualPaymentReports,
  prepareManualPaymentReport,
  readManualPaymentReport,
  reviewManualPaymentReport,
  saveManualBankDetails,
  shortManualPaymentLinkIdentity,
  submitManualPaymentReport,
} from "@ewatrade/db/queries"
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
import {
  manualReportIdentity,
  resolveManualLinkIdentity,
} from "../../banking/manual-payment-tokens"
import {
  manualPaymentStatusSocketUrl,
  publishManualPaymentStatus,
} from "../../banking/status-socket"
import {
  createBusinessPaymentLinkSchema,
  createManualBankAccountSchema,
  manualBankDetailsSchema,
  manualReportIdSchema,
  manualReportPageSchema,
  manualReportTokenSchema,
  prepareManualPaymentReportSchema,
  publicBusinessPaymentLinkSchema,
  reviewManualPaymentReportSchema,
} from "../../schemas/business-banking"
import { financeProcedure } from "../finance-procedure"
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init"
import { orderScope } from "../order-scope"
import { assertCanOperateOrders, orderError } from "./orders"

async function mapped<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
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

export const businessBankingRouter = createTRPCRouter({
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
        amountMinor: result.link.amountMinor,
        currencyCode: result.link.currencyCode,
      })
      return {
        url,
        ...sharing,
        expiresAt: result.link.expiresAt,
        amountMinor: result.link.amountMinor,
        currencyCode: result.link.currencyCode,
        allowPartial: result.link.allowPartial,
        replay: result.replay,
      }
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
  reportPayment: publicProcedure
    .input(prepareManualPaymentReportSchema)
    .mutation(async ({ ctx, input }) => {
      const identity = await resolveManualLinkIdentity(input.token, {
        readShortLink: (code) => shortManualPaymentLinkIdentity(ctx.db, code),
      })
      const result = await mapped(() =>
        prepareManualPaymentReport(ctx.db, {
          ...input,
          ...identity,
        }),
      )
      const reportToken = createPaymentLinkToken(
        {
          intentId: result.report.id,
          expiresAt: new Date(
            result.report.createdAt.getTime() + 7 * 86400_000,
          ),
        },
        paymentLinkSigningKey(),
        "manual-report",
      )
      return {
        reportId: result.report.id,
        reportToken,
        status: result.report.status,
        replay: result.replay,
        receiptUploadPath: input.receipt
          ? `/api/manual-payments/reports/${result.report.id}/receipt`
          : null,
      }
    }),
  submitReport: publicProcedure
    .input(manualReportTokenSchema)
    .mutation(async ({ ctx, input }) => {
      const proof = manualReportIdentity(input.reportToken)
      await mapped(() => submitManualPaymentReport(ctx.db, proof))
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
      return {
        reportId: row.id,
        revision: row.revision,
        status: row.status,
        payerName: row.payerName,
        claimedAmountMinor: row.claimedAmountMinor,
        receivedAmountMinor: row.receivedAmountMinor,
        submittedAt: row.submittedAt,
        decidedAt: row.decidedAt,
        receivedAt: row.receivedAt,
        decisionNote: row.decisionNote,
        bankReference: row.bankReference,
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
        reviewManualPaymentReport(ctx.db, { ...input, ...actor(ctx) }),
      )
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
