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
import {
  BUSINESS_OPERATING_MODEL_KEYS,
  BUSINESS_ORDER_CHANNEL_KEYS,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_TEAM_SIZE_KEYS,
  OPERATING_CURRENCY_CODES,
  isBusinessProfileKey,
} from "@ewatrade/utils"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { verifyGoogleIdToken } from "../../auth/mobile-google"
import { createTRPCRouter, publicProcedure } from "../init"

const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

const mobileAuthModeSchema = z.enum(["login", "sign_up"])
const businessProfileKeySchema = z
  .string()
  .trim()
  .refine(isBusinessProfileKey, "Select a supported business category")

type MobileSignupProfileInput = {
  businessProfileKey?: string
  businessProfileVersion?: 1
  mode: "login" | "sign_up"
  operatingModel?: string
  orderChannels?: string[]
  otherBusinessDescription?: string
  teamSize?: string
}

function requireMobileSignupProfile(
  value: MobileSignupProfileInput,
  ctx: z.RefinementCtx,
) {
  if (value.mode !== "sign_up") return

  const requiredFields = [
    [
      value.businessProfileKey,
      "businessProfileKey",
      "Select your business category",
    ],
    [
      value.businessProfileVersion,
      "businessProfileVersion",
      "Business profile version is required",
    ],
    [value.operatingModel, "operatingModel", "Select what you sell"],
    [value.teamSize, "teamSize", "Select your team size"],
  ] as const

  for (const [fieldValue, path, message] of requiredFields) {
    if (fieldValue !== undefined && fieldValue !== "") continue
    ctx.addIssue({ code: "custom", message, path: [path] })
  }

  if (!value.orderChannels?.length) {
    ctx.addIssue({
      code: "custom",
      message: "Select at least one order channel",
      path: ["orderChannels"],
    })
  }

  if (
    value.businessProfileKey === "other-mixed-business" &&
    !value.otherBusinessDescription?.trim()
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Tell us what your business does",
      path: ["otherBusinessDescription"],
    })
  }
}

const mobileOwnerAuthShape = {
  addressLine1: z.string().trim().min(3).max(200).optional(),
  businessProfileKey: businessProfileKeySchema.optional(),
  businessProfileVersion: z
    .literal(BUSINESS_PROFILE_SCHEMA_VERSION)
    .optional(),
  businessName: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(2).max(120).optional(),
  currencyCode: z.enum(OPERATING_CURRENCY_CODES).optional(),
  email: emailSchema,
  mode: mobileAuthModeSchema,
  name: z.string().trim().min(1).max(120).optional(),
  operatingModel: z.enum(BUSINESS_OPERATING_MODEL_KEYS).optional(),
  orderChannels: z.array(z.enum(BUSINESS_ORDER_CHANNEL_KEYS)).max(5).optional(),
  otherBusinessDescription: z.string().trim().min(2).max(240).optional(),
  phone: z.string().trim().min(7).max(40).optional(),
  teamSize: z.enum(BUSINESS_TEAM_SIZE_KEYS).optional(),
} as const

export const requestMobileOwnerOtpSchema = z
  .object(mobileOwnerAuthShape)
  .strict()
  .superRefine(requireMobileSignupProfile)

export const verifyMobileOwnerOtpSchema = z
  .object({
    ...mobileOwnerAuthShape,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  })
  .strict()
  .superRefine(requireMobileSignupProfile)

export const verifyMobileGoogleSchema = z
  .object({
    addressLine1: z.string().trim().min(3).max(200).optional(),
    businessProfileKey: businessProfileKeySchema.optional(),
    businessProfileVersion: z
      .literal(BUSINESS_PROFILE_SCHEMA_VERSION)
      .optional(),
    businessName: z.string().trim().min(1).max(120).optional(),
    city: z.string().trim().min(2).max(120).optional(),
    currencyCode: z.enum(OPERATING_CURRENCY_CODES).optional(),
    idToken: z.string().trim().min(20),
    mode: mobileAuthModeSchema,
    name: z.string().trim().min(1).max(120).optional(),
    operatingModel: z.enum(BUSINESS_OPERATING_MODEL_KEYS).optional(),
    orderChannels: z.array(z.enum(BUSINESS_ORDER_CHANNEL_KEYS)).max(5).optional(),
    otherBusinessDescription: z.string().trim().min(2).max(240).optional(),
    phone: z.string().trim().min(7).max(40).optional(),
    teamSize: z.enum(BUSINESS_TEAM_SIZE_KEYS).optional(),
  })
  .strict()
  .superRefine(requireMobileSignupProfile)

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

export function shouldDispatchMobileOwnerOtpEmail(
  env: Pick<EmailRoutingEnv, "NODE_ENV"> = process.env,
) {
  return env.NODE_ENV === "production"
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

      if (shouldDispatchMobileOwnerOtpEmail()) {
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
        const failedResult = results.find(
          (result) => result.status === "failed",
        )

        if (failedResult) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "We could not send the verification email. Try again.",
          })
        }
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
          addressLine1: input.addressLine1,
          businessProfileKey: input.businessProfileKey,
          businessProfileVersion: input.businessProfileVersion,
          businessName: input.businessName,
          city: input.city,
          currencyCode: input.currencyCode,
          email: profile.email,
          idToken: input.idToken,
          image: profile.picture,
          mode: input.mode,
          name: input.name ?? profile.name,
          operatingModel: input.operatingModel,
          orderChannels: input.orderChannels,
          otherBusinessDescription: input.otherBusinessDescription,
          phone: input.phone,
          providerAccountId: profile.sub,
          teamSize: input.teamSize,
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
