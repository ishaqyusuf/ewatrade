import { createHmac, timingSafeEqual } from "node:crypto"
import type { PrismaClient } from "@ewatrade/db"
import { runInOwnSerializableTransaction } from "@ewatrade/db/own-transaction"
import {
  MobileAccountNotFoundError,
  MobileOtpAttemptError,
  buildOwnerCredentialIdentifier,
  createMobileOwnerOtp,
  verifyMobileOwnerOtp,
} from "@ewatrade/db/queries"
import {
  createEmailMessage,
  createTestRoutedEmailMessages,
  dispatchEmailMessages,
  renderMobileOwnerOtpTemplate,
} from "@ewatrade/email"
import { OPERATING_CURRENCY_CODES } from "@ewatrade/utils"
import { getQaPolicyEnvironment } from "@ewatrade/utils/qa-policy-server"
import { z } from "zod"

const signupSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    businessName: z.string().trim().min(1).max(120),
    ageBand: z.enum(["AGE_13_TO_15", "AGE_16_TO_17", "ADULT"]),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/),
    currencyCode: z.enum(OPERATING_CURRENCY_CODES),
    legalVersion: z.string().trim().min(1).max(64),
    acceptedTerms: z.literal(true),
    acknowledgedPrivacyNotice: z.literal(true),
  })
  .strict()

export type WhatsAppOnboardingSignup = z.infer<typeof signupSchema>

const requestSchema = z
  .object({
    senderId: z.string().regex(/^[1-9]\d{7,14}$/),
    phoneNumberId: z.string().regex(/^\d{1,32}$/),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    mode: z.enum(["login", "sign_up"]),
    signup: signupSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.mode === "sign_up" && !input.signup)
      context.addIssue({
        code: "custom",
        message: "Complete registration details first.",
      })
    if (input.mode === "login" && input.signup)
      context.addIssue({
        code: "custom",
        message: "Registration details do not belong to sign-in.",
      })
  })

export type WhatsAppOnboardingEmailInput = z.infer<typeof requestSchema>

function credentialContext(input: WhatsAppOnboardingEmailInput) {
  return {
    kind: "whatsapp_onboarding" as const,
    phoneNumberId: input.phoneNumberId,
    senderId: input.senderId,
  }
}

function canonicalInput(input: WhatsAppOnboardingEmailInput) {
  return {
    ...input.signup,
    email: input.email,
    mode: input.mode,
  }
}

/** Persist the challenge first; deliver runs outside a database transaction. */
export async function issueWhatsAppOnboardingEmail(
  db: PrismaClient,
  rawInput: WhatsAppOnboardingEmailInput,
) {
  const input = requestSchema.parse(rawInput)
  const context = credentialContext(input)
  const identifier = buildOwnerCredentialIdentifier(input, context)
  const otp = await createMobileOwnerOtp(
    db,
    canonicalInput(input),
    identifier,
    context,
  )
  return {
    expiresAt: otp.expiresAt,
    // No code, bearer token or provider payload enters durable chat state.
    deliver: async () => {
      if (otp.deliverySuppressed) return
      const rendered = renderMobileOwnerOtpTemplate({
        code: otp.code,
        expiresAtLabel: otp.expiresAt.toLocaleTimeString("en", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Lagos",
        }),
        mode: input.mode,
      })
      const purpose =
        "This code is only for the WhatsApp connection you requested."
      const messages = createTestRoutedEmailMessages(
        createEmailMessage({
          from: process.env.EMAIL_FROM ?? "EwaTrade <noreply@ewatrade.com>",
          to: otp.email,
          subject: "Your EwaTrade WhatsApp verification code",
          html: rendered.html.replace(
            /(<body\b[^>]*>)/i,
            `$1<p>${purpose}</p>`,
          ),
          text: `${purpose}\n\n${rendered.text}`,
        }),
        { env: await getQaPolicyEnvironment() },
      )
      const results = await dispatchEmailMessages(messages)
      if (results.some((result) => result.status === "failed"))
        throw new Error(
          "The verification email could not be sent. Try again later.",
        )
    },
  }
}

const verifiedSchema = z
  .object({
    kind: z.literal("whatsapp_email_proof_v1"),
    codeDigest: z.string().regex(/^[a-f0-9]{64}$/),
    userId: z.string().min(1),
    sessionId: z.string().min(1),
    businessId: z.string().nullable(),
    storeId: z.string().nullable(),
  })
  .strict()

export type WhatsAppOnboardingEmailProof =
  | {
      kind: "verified"
      userId: string
      sessionId: string
      businessId: string | null
      storeId: string | null
    }
  | { kind: "rejected" }

function privateDigest(value: string) {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret) throw new Error("Authentication secret is required")
  return createHmac("sha256", secret)
    .update(`whatsapp-onboarding-proof:v1:${value}`)
    .digest("hex")
}

/**
 * Owns only a short DB transaction. A private receipt makes a lost response
 * retry safe without issuing another account/session or reusing the app OTP.
 * Session IDs stay within server authority adapters; never include them in chat.
 */
export async function verifyWhatsAppOnboardingEmail(
  db: PrismaClient,
  rawInput: WhatsAppOnboardingEmailInput & {
    code: string
    operationId: string
    onboardingLease: { token: string; nonce: string }
  },
): Promise<WhatsAppOnboardingEmailProof> {
  const { code, operationId, onboardingLease, ...rawRequest } = rawInput
  if (!/^\d{6}$/.test(code) || !operationId || operationId.length > 256)
    return { kind: "rejected" }
  const input = requestSchema.parse(rawRequest)
  const context = credentialContext(input)
  const identifier = buildOwnerCredentialIdentifier(input, context)
  const token = `wa-proof_${privateDigest(`${identifier}:${operationId}`)}`
  const codeDigest = privateDigest(`${token}:${code}`)
  return runInOwnSerializableTransaction(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${onboardingLease.token}))`
    const flow = await tx.onboardingSession.findUnique({
      where: { token: onboardingLease.token },
      select: { formData: true, expiresAt: true },
    })
    const flowData = flow?.formData
    const lease =
      flowData && typeof flowData === "object" && !Array.isArray(flowData)
        ? flowData.lease
        : null
    if (
      !flow ||
      flow.expiresAt <= new Date() ||
      !flowData ||
      typeof flowData !== "object" ||
      Array.isArray(flowData) ||
      flowData.kind !== "whatsapp_onboarding_runtime_v1" ||
      !lease ||
      typeof lease !== "object" ||
      Array.isArray(lease) ||
      lease.nonce !== onboardingLease.nonce ||
      typeof lease.expiresAt !== "number" ||
      lease.expiresAt <= Date.now()
    )
      return { kind: "rejected" }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identifier}))`
    const now = new Date()
    const prior = await tx.onboardingSession.findUnique({ where: { token } })
    if (prior) {
      const parsed = verifiedSchema.safeParse(prior.formData)
      if (
        !parsed.success ||
        prior.expiresAt <= now ||
        !timingSafeEqual(
          Buffer.from(parsed.data.codeDigest, "hex"),
          Buffer.from(codeDigest, "hex"),
        )
      )
        return { kind: "rejected" }
      const session = await tx.session.findFirst({
        where: {
          id: parsed.data.sessionId,
          userId: parsed.data.userId,
          expiresAt: { gt: now },
        },
        select: { id: true },
      })
      if (!session) return { kind: "rejected" }
      return {
        kind: "verified",
        userId: parsed.data.userId,
        sessionId: session.id,
        businessId: parsed.data.businessId,
        storeId: parsed.data.storeId,
      }
    }
    let result: Awaited<ReturnType<typeof verifyMobileOwnerOtp>>
    try {
      result = await verifyMobileOwnerOtp(
        tx,
        { ...canonicalInput(input), code },
        context,
      )
    } catch (error) {
      // Return, rather than throw: failed-guess counters must commit.
      if (
        error instanceof MobileOtpAttemptError ||
        error instanceof MobileAccountNotFoundError
      )
        return { kind: "rejected" }
      throw error
    }
    const session = await tx.session.findUnique({
      where: { token: result.token },
      select: { id: true },
    })
    if (!session)
      throw new Error("The verified account session could not be established.")
    const proofExpiresAt = new Date(now.getTime() + 10 * 60_000)
    // This session is only a short-lived server-side proof for the link authority.
    // No ordinary app credential is delivered to the WhatsApp user.
    await tx.session.update({
      where: { id: session.id },
      data: { expiresAt: proofExpiresAt },
    })
    const receipt = {
      kind: "whatsapp_email_proof_v1" as const,
      codeDigest,
      userId: result.profile.id,
      sessionId: session.id,
      businessId: result.tenant?.id ?? null,
      storeId: result.tenant?.storeId ?? null,
    }
    await tx.onboardingSession.create({
      data: {
        token,
        userId: receipt.userId,
        completed: true,
        formData: receipt,
        expiresAt: proofExpiresAt,
      },
    })
    return {
      kind: "verified",
      userId: receipt.userId,
      sessionId: receipt.sessionId,
      businessId: receipt.businessId,
      storeId: receipt.storeId,
    }
  })
}
