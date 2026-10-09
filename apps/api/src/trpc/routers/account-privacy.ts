import {
  AccountPrivacyAccessError,
  AccountPrivacyCommercialOutcomeError,
  AccountPrivacyCompletionError,
  AccountPrivacyConversationAccessError,
  AccountPrivacyConversationOutcomeError,
  AccountPrivacyIdentityOutcomeError,
  AccountPrivacyMembershipError,
  AccountPrivacyNoticePreparationError,
  AccountPrivacyPrescriptionOutcomeError,
  AccountPrivacyProfileError,
  AccountPrivacyRetentionError,
  AccountPrivacySubscriptionError,
  beginAccountPrivacyReview,
  completeAccountPrivacyRequest,
  confirmAccountPrivacyIdentityAccessRevoked,
  confirmNoAccountPrivacyCommercialRecords,
  confirmNoAccountPrivacyConversations,
  confirmNoAccountPrivacyPrescriptions,
  confirmNoAccountPrivacySubscriptions,
  createExternalDeletionChallenge,
  discardUndeliveredExternalDeletionChallenge,
  getAccountDeletionRequest,
  getAccountLegalStatus,
  getAccountPrivacyReview,
  listAccountPrivacyRequests,
  listAccountPrivacyRetentionReviews,
  processAccountPrivacyProfile,
  recordLegalAcceptance,
  requestAccountDeletion,
  reviewAccountPrivacyRetention,
  revokeAccountPrivacyAccess,
  revokeAccountPrivacyConversationAccess,
  revokeAccountPrivacyMembershipAccess,
  submitExternalDeletionRequest,
} from "@ewatrade/db/queries"
import {
  createEmailMessage,
  dispatchEmailMessages,
  renderAccountDeletionVerificationTemplate,
  shouldRouteEmailToTestRecipients,
} from "@ewatrade/email"
import { isAccountPrivacyEmailIntakeConfigured } from "@ewatrade/utils/account-privacy-intake"
import { canAcceptLegalVersion } from "@ewatrade/utils/legal-approval"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { sendAccountPrivacyOutcomeNotice } from "../../account-privacy/notice-sender"
import {
  revokeAppleAccessToken,
  revokeAppleAuthorization,
} from "../../auth/apple-credentials"
import { revokeGoogleAuthorization } from "../../auth/google-credentials"
import {
  acceptLegalDocumentsSchema,
  externalDeletionEmailSchema,
  externalDeletionVerifySchema,
  requestAccountDeletionSchema,
} from "../../schemas/account-privacy"
import {
  authenticatedProcedure,
  createTRPCRouter,
  platformAdminProcedure,
  publicProcedure,
} from "../init"

function isExternalIntakeConfigured() {
  return isAccountPrivacyEmailIntakeConfigured(process.env)
}

function assertExternalIntakeReady() {
  if (!isExternalIntakeConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Account deletion request intake is unavailable. Please try again later.",
    })
  }
}

export const accountPrivacyRouter = createTRPCRouter({
  retentionReviews: platformAdminProcedure.query(({ ctx }) =>
    listAccountPrivacyRetentionReviews(ctx.db),
  ),
  reviewRetention: platformAdminProcedure
    .input(
      z
        .object({
          requestId: z.string().min(1),
          hold: z
            .object({
              reason: z.string().trim().min(1).max(1000),
              reviewAt: z.coerce.date(),
            })
            .strict()
            .nullable(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await reviewAccountPrivacyRetention(ctx.db, {
          ...input,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyRetentionError)
          throw new TRPCError({
            code:
              error.code === "OPERATOR_REQUIRED"
                ? "FORBIDDEN"
                : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  externalIntakeAvailability: publicProcedure.query(({ ctx }) => ({
    available: isExternalIntakeConfigured() && Boolean(ctx.privacyClientIp),
  })),
  legalStatus: authenticatedProcedure.query(({ ctx }) =>
    getAccountLegalStatus(ctx.db, ctx.session.user.id),
  ),
  reviewQueue: platformAdminProcedure
    .input(
      z
        .object({
          cursor: z.string().min(1).optional(),
          status: z
            .enum([
              "RECEIVED",
              "UNDER_REVIEW",
              "PROCESSING",
              "COMPLETED",
              "FAILED",
              "CANCELLED",
            ])
            .optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await listAccountPrivacyRequests(ctx.db, input)
      return {
        items: rows.slice(0, 50),
        nextCursor: rows.length > 50 ? (rows[49]?.id ?? null) : null,
      }
    }),
  reviewDetail: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .query(({ ctx, input }) =>
      getAccountPrivacyReview(ctx.db, input.requestId),
    ),
  beginReview: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await beginAccountPrivacyReview(ctx.db, {
          requestId: input.requestId,
          reviewerUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyAccessError)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  revokeAccess: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      if (process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Account privacy processing is unavailable.",
        })
      try {
        return await revokeAccountPrivacyAccess(ctx.db, {
          requestId: input.requestId,
          operatorUserId: ctx.session.user.id,
          revokeApple: revokeAppleAuthorization,
          revokeAppleAccess: revokeAppleAccessToken,
          revokeGoogle: revokeGoogleAuthorization,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyAccessError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  revokeMembershipAccess: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await revokeAccountPrivacyMembershipAccess(ctx.db, {
          requestId: input.requestId,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyMembershipError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  revokeConversationAccess: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await revokeAccountPrivacyConversationAccess(ctx.db, {
          requestId: input.requestId,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyConversationAccessError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  confirmNoSubscriptions: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await confirmNoAccountPrivacySubscriptions(ctx.db, {
          requestId: input.requestId,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacySubscriptionError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  confirmNoConversations: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await confirmNoAccountPrivacyConversations(ctx.db, {
          requestId: input.requestId,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyConversationOutcomeError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  confirmIdentityAccessRevoked: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await confirmAccountPrivacyIdentityAccessRevoked(ctx.db, {
          requestId: input.requestId,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyIdentityOutcomeError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  confirmNoCommercialRecords: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await confirmNoAccountPrivacyCommercialRecords(ctx.db, {
          requestId: input.requestId,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyCommercialOutcomeError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  confirmNoPrescriptions: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await confirmNoAccountPrivacyPrescriptions(ctx.db, {
          requestId: input.requestId,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyPrescriptionOutcomeError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  processProfile: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await processAccountPrivacyProfile(ctx.db, {
          requestId: input.requestId,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyProfileError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  sendOutcomeNotice: platformAdminProcedure
    .input(
      z
        .object({
          requestId: z.string().min(1),
          subject: z.string().trim().min(1).max(180),
          text: z.string().trim().min(1).max(16_000),
          // Canonical shell plus up to 16k escaped text characters.
          html: z.string().trim().min(1).max(128_000),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await sendAccountPrivacyOutcomeNotice(ctx.db, {
          ...input,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyNoticePreparationError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  completeRequest: platformAdminProcedure
    .input(z.object({ requestId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await completeAccountPrivacyRequest(ctx.db, {
          requestId: input.requestId,
          operatorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof AccountPrivacyCompletionError)
          throw new TRPCError({
            code:
              error.code === "NOT_FOUND" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
  requestExternalCode: publicProcedure
    .input(externalDeletionEmailSchema)
    .mutation(async ({ ctx, input }) => {
      assertExternalIntakeReady()
      if (!ctx.privacyClientIp)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Verified request intake is unavailable from this connection.",
        })
      // A code delivered to a QA inbox cannot prove control of the supplied
      // email address, even when the mail transport reports success.
      if (shouldRouteEmailToTestRecipients(input.email))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Use an email address that can receive the verification code.",
        })
      const challenge = await createExternalDeletionChallenge(
        ctx.db,
        input.email,
        ctx.privacyClientIp,
      )
      if (challenge) {
        const message = createEmailMessage({
          from: process.env.EMAIL_FROM ?? "",
          to: challenge.email,
          subject: "Your EwaTrade account deletion request code",
          ...renderAccountDeletionVerificationTemplate({
            code: challenge.code,
          }),
        })
        try {
          const delivery = await dispatchEmailMessages([message])
          if (delivery.some((result) => result.status === "failed")) {
            throw new Error("Verification delivery failed")
          }
        } catch {
          await discardUndeliveredExternalDeletionChallenge(ctx.db, challenge)
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message:
              "The verification email could not be sent. Please try again later.",
          })
        }
      }
      return { sent: true }
    }),
  submitExternalRequest: publicProcedure
    .input(externalDeletionVerifySchema)
    .mutation(async ({ ctx, input }) => {
      assertExternalIntakeReady()
      const request = await submitExternalDeletionRequest(
        ctx.db,
        input.email,
        input.code,
      )
      if (!request)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The code is invalid or expired. Request a new code and try again.",
        })
      return request
    }),
  deletionRequest: authenticatedProcedure.query(({ ctx }) =>
    getAccountDeletionRequest(ctx.db, ctx.session.user.id),
  ),
  deletionIntakeAvailability: authenticatedProcedure.query(() => ({
    available: process.env.ACCOUNT_PRIVACY_REQUESTS_ENABLED === "true",
  })),
  requestDeletion: authenticatedProcedure
    .input(requestAccountDeletionSchema)
    .mutation(({ ctx }) => {
      if (process.env.ACCOUNT_PRIVACY_REQUESTS_ENABLED !== "true") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Account deletion requests are not yet available. Please use the published support channel.",
        })
      }
      const authenticatedAt = new Date(ctx.session.session.createdAt).getTime()
      if (
        !ctx.session.user.emailVerified ||
        !Number.isFinite(authenticatedAt) ||
        Date.now() - authenticatedAt > 15 * 60_000
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Sign in again to verify your account before requesting deletion.",
        })
      }
      if (ctx.qaSessionScope || ctx.session.session.token.startsWith("qas_")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Use your own account session to request deletion.",
        })
      }
      return requestAccountDeletion(
        ctx.db,
        ctx.session.user.id,
        ctx.session.user.email,
      )
    }),
  acceptLegalDocuments: authenticatedProcedure
    .input(acceptLegalDocumentsSchema)
    .mutation(({ ctx, input }) => {
      if (!canAcceptLegalVersion(input.version)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "These documents are not approved for acceptance. Reload the current version.",
        })
      }
      return recordLegalAcceptance(ctx.db, {
        userId: ctx.session.user.id,
        version: input.version,
        surface: input.surface,
      })
    }),
})
