import { auth } from "@ewatrade/auth"
import {
  OnboardingContinuationError,
  onboardingDraftSchema,
  readApprovedOnboarding,
  saveApprovedOnboardingDraft,
  verifyApprovedOnboardingEmail,
} from "@ewatrade/db/onboarding-continuation"
import {
  consumeMobileAppleChallenge,
  createMobileAppleChallenge,
  getMobileAppleChallenge,
  verifyMobileAppleIdentity,
} from "@ewatrade/db/queries"
import {
  MobileAccountNotFoundError,
  consumeMobilePasswordAttempt,
  createMobileOwnerOtp,
  createMobileSessionForVerifiedUser,
  getCustomerAccountAgeStatus,
  getMobileAccessProfile,
  verifyMobileGoogleIdentity,
  verifyMobileOwnerOtp,
} from "@ewatrade/db/queries"
import {
  type EmailRoutingEnv,
  createEmailMessage,
  createTestRoutedEmailMessages,
  dispatchEmailMessages,
  renderMobileOwnerOtpTemplate,
} from "@ewatrade/email"
import { AppError } from "@ewatrade/errors"
import {
  BUSINESS_OPERATING_MODEL_KEYS,
  BUSINESS_ORDER_CHANNEL_KEYS,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_TEAM_SIZE_KEYS,
  OPERATING_CURRENCY_CODES,
  isBusinessProfileKey,
} from "@ewatrade/utils"
import {
  currentEffectiveLegalPublication,
  isLegalTestingEnvironment,
  isSignupAvailableForLegalPublication,
  resolveLegalSignupChoice,
} from "@ewatrade/utils/legal-approval"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  appleCredentialExchangeConfigured,
  exchangeAppleAuthorizationCode,
} from "../../auth/apple-credentials"
import { verifyAppleIdToken } from "../../auth/mobile-apple"
import { verifyGoogleIdToken } from "../../auth/mobile-google"
import {
  createTRPCRouter,
  mobileEntryProcedure,
  publicProcedure,
} from "../init"

const emailSchema = z.string().trim().toLowerCase().pipe(z.email())
const onboardingTokenSchema = z.string().regex(/^ea_[A-Za-z0-9_-]{43}$/)

function onboardingFailure(error: unknown): never {
  if (error instanceof OnboardingContinuationError)
    throw new TRPCError({
      code: error.code === "CONFLICT" ? "CONFLICT" : "PRECONDITION_FAILED",
      cause: new AppError({ code: `ONBOARDING_${error.code}`, cause: error }),
      message: error.message,
    })
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Setup is temporarily unavailable. Try again.",
  })
}
export const mobilePasswordSignInSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(1024),
  })
  .strict()

const mobileAuthModeSchema = z.enum(["login", "sign_up"])
const businessProfileKeySchema = z
  .string()
  .trim()
  .refine(isBusinessProfileKey, "Select a supported business category")
const optionalBusinessDescriptionSchema = z
  .string()
  .trim()
  .max(240)
  .optional()
  .refine(
    (value) => !value || value.length >= 2,
    "Describe the business in at least 2 characters",
  )

type MobileSignupProfileInput = {
  ageBand?: "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"
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
    [value.ageBand, "ageBand", "Choose an eligible age range"],
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
  accessToken: onboardingTokenSchema.optional(),
  ageBand: z.enum(["AGE_13_TO_15", "AGE_16_TO_17", "ADULT"]).optional(),
  addressLine1: z.string().trim().min(3).max(200).optional(),
  businessProfileKey: businessProfileKeySchema.optional(),
  businessProfileVersion: z.literal(BUSINESS_PROFILE_SCHEMA_VERSION).optional(),
  businessName: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(2).max(120).optional(),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
  currencyCode: z.enum(OPERATING_CURRENCY_CODES).optional(),
  email: emailSchema,
  mode: mobileAuthModeSchema,
  name: z.string().trim().min(1).max(120).optional(),
  operatingModel: z.enum(BUSINESS_OPERATING_MODEL_KEYS).optional(),
  orderChannels: z.array(z.enum(BUSINESS_ORDER_CHANNEL_KEYS)).max(5).optional(),
  otherBusinessDescription: optionalBusinessDescriptionSchema,
  phone: z.string().trim().min(7).max(40).optional(),
  teamSize: z.enum(BUSINESS_TEAM_SIZE_KEYS).optional(),
} as const

const mobileSignupLegalShape = {
  legalVersion: z.string().trim().min(1).max(64).optional(),
  acceptedTerms: z.literal(true).optional(),
  acknowledgedPrivacyNotice: z.literal(true).optional(),
} as const

function requireMobileLegalChoice(input: {
  mode: "login" | "sign_up"
  legalVersion?: string
  acceptedTerms?: true
  acknowledgedPrivacyNotice?: true
}) {
  if (input.mode === "login") {
    if (
      input.legalVersion !== undefined ||
      input.acceptedTerms !== undefined ||
      input.acknowledgedPrivacyNotice !== undefined
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Legal acceptance is available during signup only.",
      })
    return
  }
  try {
    resolveLegalSignupChoice(input)
  } catch (error) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Review the current Terms and Privacy Notice.",
    })
  }
}

export const requestMobileOwnerOtpSchema = z
  .object({ ...mobileOwnerAuthShape, ...mobileSignupLegalShape })
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
    accessToken: onboardingTokenSchema.optional(),
    ageBand: z.enum(["AGE_13_TO_15", "AGE_16_TO_17", "ADULT"]).optional(),
    ...mobileSignupLegalShape,
    addressLine1: z.string().trim().min(3).max(200).optional(),
    businessProfileKey: businessProfileKeySchema.optional(),
    businessProfileVersion: z
      .literal(BUSINESS_PROFILE_SCHEMA_VERSION)
      .optional(),
    businessName: z.string().trim().min(1).max(120).optional(),
    city: z.string().trim().min(2).max(120).optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .optional(),
    currencyCode: z.enum(OPERATING_CURRENCY_CODES).optional(),
    idToken: z.string().trim().min(20),
    mode: mobileAuthModeSchema,
    name: z.string().trim().min(1).max(120).optional(),
    operatingModel: z.enum(BUSINESS_OPERATING_MODEL_KEYS).optional(),
    orderChannels: z
      .array(z.enum(BUSINESS_ORDER_CHANNEL_KEYS))
      .max(5)
      .optional(),
    otherBusinessDescription: optionalBusinessDescriptionSchema,
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
  const expiresAt = input.expiresAt.toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  })

  return {
    ...renderMobileOwnerOtpTemplate({
      code: input.code,
      expiresAtLabel: expiresAt,
      mode: input.mode,
    }),
    subject: "Your EwaTrade verification code",
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
  env: Pick<EmailRoutingEnv, "NODE_ENV"> & { APP_ENV?: string } = process.env,
) {
  return env.NODE_ENV === "production" || env.APP_ENV === "production"
}

export const authRouter = createTRPCRouter({
  verifyMobileOnboardingEmail: publicProcedure
    .input(
      z.object({ token: z.string().regex(/^ear_[A-Za-z0-9_-]{43}$/) }).strict(),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.db.$transaction(
          (tx) => verifyApprovedOnboardingEmail(tx, input.token),
          { maxWait: 10_000, timeout: 30_000 },
        )
      } catch (error) {
        onboardingFailure(error)
      }
    }),
  getMobileOnboarding: publicProcedure
    .input(z.object({ token: onboardingTokenSchema }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        const { session, data } = await readApprovedOnboarding(
          ctx.db,
          input.token,
        )
        return {
          expiresAt: session.expiresAt,
          emailVerified: Boolean(data.emailVerifiedAt),
          email: data.email,
          fullName: data.fullName,
          businessName: data.companyName ?? "",
          phone: data.phone ?? "",
          draft: data.draft ?? {},
        }
      } catch (error) {
        onboardingFailure(error)
      }
    }),
  saveMobileOnboardingDraft: publicProcedure
    .input(
      z
        .object({ token: onboardingTokenSchema, draft: onboardingDraftSchema })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await saveApprovedOnboardingDraft(ctx.db, input)
        return { saved: true }
      } catch (error) {
        onboardingFailure(error)
      }
    }),
  legalPublication: publicProcedure.query(() => {
    const publication = currentEffectiveLegalPublication()
    return publication
      ? {
          acceptanceRequired: !isLegalTestingEnvironment(),
          effective: true,
          signupAvailable: true,
          version: publication.version,
          effectiveDate: publication.effectiveDate,
        }
      : {
          acceptanceRequired: !isLegalTestingEnvironment(),
          effective: false,
          signupAvailable: isSignupAvailableForLegalPublication(false),
          version: null,
          effectiveDate: null,
        }
  }),
  signInMobilePassword: publicProcedure
    .input(mobilePasswordSignInSchema)
    .mutation(async ({ ctx, input }) => {
      const allowed = await consumeMobilePasswordAttempt(
        ctx.db,
        input.email,
      ).catch(() => false)
      if (!allowed)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many sign-in attempts. Try again later.",
        })
      const verifiedUser = await ctx.db.user.findUnique({
        where: { email: input.email },
        select: { emailVerified: true },
      })
      if (!verifiedUser?.emailVerified) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password, or the account is not verified.",
        })
      }
      const authenticated = await auth.api
        .signInEmail({
          body: input,
          headers: ctx.requestHeaders,
        })
        .catch(() => null)
      if (!authenticated?.user?.id || !authenticated.user.emailVerified) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password, or the account is not verified.",
        })
      }
      try {
        return await createMobileSessionForVerifiedUser(
          ctx.db,
          authenticated.user.id,
        )
      } catch {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password, or the account is not verified.",
        })
      }
    }),
  createMobileAppleChallenge: publicProcedure.mutation(async ({ ctx }) => {
    const clientIds = (process.env.APPLE_CLIENT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
    if (clientIds.length === 0 || !(await appleCredentialExchangeConfigured()))
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Apple sign-in is not configured. Use email sign-in.",
      })
    return createMobileAppleChallenge(ctx.db)
  }),
  verifyMobileApple: publicProcedure
    .input(
      verifyMobileGoogleSchema.safeExtend({
        challengeId: z.string().uuid(),
        authorizationCode: z.string().min(1).max(4096),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireMobileLegalChoice(input)
      const challenge = await getMobileAppleChallenge(ctx.db, input.challengeId)
      if (!challenge)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Apple sign-in expired. Please try again.",
        })
      try {
        const profile = await verifyAppleIdToken({
          idToken: input.idToken,
          nonce: challenge.value,
        })
        const tokens = await exchangeAppleAuthorizationCode(
          input.authorizationCode,
          profile.aud,
        )
        const exchanged = await verifyAppleIdToken({
          idToken: tokens.idToken,
          nonce: challenge.value,
        })
        if (exchanged.sub !== profile.sub || exchanged.aud !== profile.aud)
          throw new Error("Apple authorization code identity mismatch.")
        return await ctx.db.$transaction(
          async (tx) => {
            await consumeMobileAppleChallenge(
              tx,
              input.challengeId,
              challenge.value,
            )
            return verifyMobileAppleIdentity(tx, {
              ...input,
              idToken: undefined,
              email: profile.email,
              providerAccountId: profile.sub,
              encryptedRefreshToken: tokens.encryptedRefreshToken,
              clientId: profile.aud,
            })
          },
          { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
        )
      } catch (error) {
        if (error instanceof OnboardingContinuationError)
          onboardingFailure(error)
        if (error instanceof MobileAccountNotFoundError)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          })
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Apple sign-in could not be verified. Try again or use email sign-in.",
        })
      }
    }),
  getMobileAccessProfile: mobileEntryProcedure.query(async ({ ctx }) => {
    const age = await getCustomerAccountAgeStatus(ctx.db, ctx.session.user.id)
    if (!age.eligible)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Choose an eligible age range before opening your workspace.",
      })
    if (ctx.qaSessionScope) {
      const scope = ctx.qaSessionScope
      const membership = await ctx.db.membership.findFirst({
        where: {
          id: scope.membershipId,
          userId: ctx.session.user.id,
          status: "ACTIVE",
          tenant: {
            id: scope.tenantId,
            dataClassification: "QA",
            isActive: true,
            qaPurgeStartedAt: null,
            stores: { some: { id: scope.storeId, status: "ACTIVE" } },
          },
        },
        select: { id: true },
      })
      if (!membership)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your selected QA business or Store is no longer available.",
        })
      return { hasBusinessAccess: true, hasCustomerHistory: false }
    }
    return getMobileAccessProfile(ctx.db, { userId: ctx.session.user.id })
  }),

  requestMobileOwnerOtp: publicProcedure
    .input(requestMobileOwnerOtpSchema)
    .mutation(async ({ ctx, input }) => {
      requireMobileLegalChoice(input)
      const otp = await (async () => {
        try {
          return await createMobileOwnerOtp(ctx.db, input)
        } catch (error) {
          if (error instanceof OnboardingContinuationError)
            onboardingFailure(error)
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
        devCode: shouldDispatchMobileOwnerOtpEmail() ? null : otp.code,
        email: otp.email,
        expiresAt: otp.expiresAt,
      }
    }),

  verifyMobileOwnerOtp: publicProcedure
    .input(verifyMobileOwnerOtpSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.db.$transaction(
          (tx) => verifyMobileOwnerOtp(tx, input),
          { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
        )
      } catch (error) {
        if (error instanceof OnboardingContinuationError)
          onboardingFailure(error)
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
      requireMobileLegalChoice(input)
      const profile = await verifyGoogleIdToken({ idToken: input.idToken })

      try {
        return await ctx.db.$transaction(
          (tx) =>
            verifyMobileGoogleIdentity(tx, {
              accessToken: input.accessToken,
              ageBand: input.ageBand,
              addressLine1: input.addressLine1,
              businessProfileKey: input.businessProfileKey,
              businessProfileVersion: input.businessProfileVersion,
              businessName: input.businessName,
              city: input.city,
              countryCode: input.countryCode,
              currencyCode: input.currencyCode,
              email: profile.email,
              idToken: input.idToken,
              image: profile.picture,
              legalVersion: input.legalVersion,
              acceptedTerms: input.acceptedTerms,
              acknowledgedPrivacyNotice: input.acknowledgedPrivacyNotice,
              mode: input.mode,
              name: input.name ?? profile.name,
              operatingModel: input.operatingModel,
              orderChannels: input.orderChannels,
              otherBusinessDescription: input.otherBusinessDescription,
              phone: input.phone,
              providerAccountId: profile.sub,
              teamSize: input.teamSize,
            }),
          { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
        )
      } catch (error) {
        if (error instanceof OnboardingContinuationError)
          onboardingFailure(error)
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
