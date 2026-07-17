import {
  createMobileOwnerOtp,
  verifyMobileGoogleIdentity,
  verifyMobileOwnerOtp,
} from "@ewatrade/db/queries"
import {
  type EmailRoutingEnv,
  createEmailMessage,
  createTestRoutedEmailMessages,
  dispatchEmailMessages,
} from "@ewatrade/email"
import { OPERATING_CURRENCY_CODES } from "@ewatrade/utils"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { verifyGoogleIdToken } from "../../auth/mobile-google"
import { createTRPCRouter, publicProcedure } from "../init"

const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

const mobileAuthModeSchema = z.enum(["login", "sign_up"])

export const requestMobileOwnerOtpSchema = z
  .object({
    businessName: z.string().trim().min(1).max(120).optional(),
    currencyCode: z.enum(OPERATING_CURRENCY_CODES).optional(),
    email: emailSchema,
    mode: mobileAuthModeSchema,
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

export const verifyMobileOwnerOtpSchema = requestMobileOwnerOtpSchema.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
})

export const verifyMobileGoogleSchema = z
  .object({
    businessName: z.string().trim().min(1).max(120).optional(),
    currencyCode: z.enum(OPERATING_CURRENCY_CODES).optional(),
    idToken: z.string().trim().min(20),
    mode: mobileAuthModeSchema,
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

function getEmailFromAddress() {
  return process.env.EMAIL_FROM ?? "Ewatrade <noreply@ewatrade.com>"
}

function renderOtpEmail(input: {
  code: string
  expiresAt: Date
  mode: "login" | "sign_up"
}) {
  const action =
    input.mode === "login"
      ? "sign in to your Ewatrade account"
      : "verify your Ewatrade account"
  const expiresAt = input.expiresAt.toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  })

  return {
    html: `<p>Use this code to ${action}:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${input.code}</p><p>This code expires at ${expiresAt}.</p>`,
    subject: "Your Ewatrade verification code",
    text: `Use this code to ${action}: ${input.code}\n\nThis code expires at ${expiresAt}.`,
  }
}

export function createMobileOwnerOtpEmailMessages(input: {
  code: string
  email: string
  env?: EmailRoutingEnv
  expiresAt: Date
  mode: "login" | "sign_up"
}) {
  const email = renderOtpEmail({
    code: input.code,
    expiresAt: input.expiresAt,
    mode: input.mode,
  })

  return createTestRoutedEmailMessages(
    createEmailMessage({
      from: getEmailFromAddress(),
      html: email.html,
      subject: email.subject,
      text: email.text,
      to: input.email,
    }),
    { env: input.env },
  )
}

export const authRouter = createTRPCRouter({
  requestMobileOwnerOtp: publicProcedure
    .input(requestMobileOwnerOtpSchema)
    .mutation(async ({ ctx, input }) => {
      const otp = await (async () => {
        try {
          return await createMobileOwnerOtp(ctx.db, input)
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : "We could not create the verification code.",
          })
        }
      })()

      const emailMessages = (() => {
        try {
          return createMobileOwnerOtpEmailMessages({
            code: otp.code,
            email: otp.email,
            expiresAt: otp.expiresAt,
            mode: input.mode,
          })
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "We could not send the verification email. Try again.",
          })
        }
      })()
      const results = await dispatchEmailMessages(emailMessages)
      const failedResult = results.find((result) => result.status === "failed")

      if (failedResult) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We could not send the verification email. Try again.",
        })
      }

      return {
        devCode: process.env.NODE_ENV === "production" ? null : otp.code,
        email: otp.email,
        expiresAt: otp.expiresAt,
      }
    }),

  verifyMobileOwnerOtp: publicProcedure
    .input(verifyMobileOwnerOtpSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await verifyMobileOwnerOtp(ctx.db, input)
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Unable to verify this code.",
        })
      }
    }),

  verifyMobileGoogle: publicProcedure
    .input(verifyMobileGoogleSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await verifyGoogleIdToken({ idToken: input.idToken })

      try {
        return await verifyMobileGoogleIdentity(ctx.db, {
          businessName: input.businessName,
          currencyCode: input.currencyCode,
          email: profile.email,
          idToken: input.idToken,
          image: profile.picture,
          mode: input.mode,
          name: input.name ?? profile.name,
          providerAccountId: profile.sub,
        })
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Unable to complete Google sign-in.",
        })
      }
    }),
})
