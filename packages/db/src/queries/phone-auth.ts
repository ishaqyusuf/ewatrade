import { randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import { normalizeOperatingCurrencyCode } from "@ewatrade/utils"
import {
  currentEffectiveLegalPublication,
  resolveLegalSignupChoice,
} from "@ewatrade/utils/legal-approval"
import type { PrismaClient } from "../../generated/prisma/client"
import { AccountAgeBand } from "../../generated/prisma/enums"
import { recordLegalAcceptance } from "./account-privacy"
import {
  type createMobileOwnerOtp,
  createMobileSessionForVerifiedUser,
} from "./mobile-auth"
import { createOwnerSignupBusiness } from "./owner-businesses"
import {
  phoneAuthDigest as digest,
  buildPhoneOtpIdentifier as identifier,
} from "./phone-otp-identifier"
import type { DbClient } from "./types"

export type PhoneOtpRequest = Omit<
  Parameters<typeof createMobileOwnerOtp>[1],
  "email" | "accessToken" | "phone"
> & { phone: string }
type Challenge = {
  attempts: number
  codeHash: string
  draft: PhoneOtpRequest
  legalDocumentHash: string | null
}
const transactionOptions = {
  isolationLevel: "Serializable" as const,
  maxWait: 10_000,
  timeout: 30_000,
}

export function isLocalPhoneAuth(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.DEV_PROFILE === "local" &&
    (!env.APP_ENV || env.APP_ENV === "local") &&
    env.NODE_ENV !== "production"
  )
}

export function normalizeAuthPhone(phone: string) {
  const value = phone.trim()
  if (!/^\+[1-9]\d{7,14}$/.test(value))
    throw new Error("Enter your phone number with its country code.")
  return value
}

export async function purgeExpiredPhoneOtpChallenges(
  db: Pick<PrismaClient, "verification">,
  now = new Date(),
) {
  return db.verification.deleteMany({
    where: {
      identifier: { startsWith: "phone-auth:" },
      expiresAt: { lte: now },
    },
  })
}

async function consumeSendBudget(
  tx: DbClient,
  key: string,
  maximum: number,
  now: Date,
) {
  const bucketDigest = digest(`phone-otp-rate:${key}`)
  const bucket = await tx.accountPrivacyRateBucket.findUnique({
    where: { bucketDigest },
  })
  const active =
    bucket && now.getTime() - bucket.windowStartedAt.getTime() < 15 * 60_000
  if (active && bucket.sentCount >= maximum)
    throw new Error("Too many codes requested. Try again later.")
  await tx.accountPrivacyRateBucket.upsert({
    where: { bucketDigest },
    create: { bucketDigest, windowStartedAt: now, sentCount: 1 },
    update: {
      windowStartedAt: active ? undefined : now,
      sentCount: active ? { increment: 1 } : 1,
    },
  })
}

export async function createPhoneOtp(
  db: PrismaClient,
  input: PhoneOtpRequest,
  networkSource: string,
  now = new Date(),
) {
  const phone = normalizeAuthPhone(input.phone)
  if (!networkSource)
    throw new Error("Phone verification is temporarily unavailable.")
  if (
    input.mode === "sign_up" &&
    (!input.ageBand || input.ageBand === AccountAgeBand.UNDECLARED)
  ) {
    throw new Error("Choose an eligible age range before creating an account.")
  }
  const legal =
    input.mode === "sign_up"
      ? resolveLegalSignupChoice(input, currentEffectiveLegalPublication())
      : null
  const id = identifier(phone, input.mode)
  const code = isLocalPhoneAuth()
    ? "123456"
    : randomInt(0, 1_000_000).toString().padStart(6, "0")
  const expiresAt = new Date(now.getTime() + 5 * 60_000)
  const challenge: Challenge = {
    attempts: 0,
    codeHash: digest(`${id}:${code}`),
    draft: { ...input, phone },
    legalDocumentHash: legal?.documentHash ?? null,
  }
  await db.$transaction(
    async (tx) => {
      // Global and trusted-network budgets bound provider costs across many numbers.
      await consumeSendBudget(tx, "global", 100, now)
      await consumeSendBudget(tx, `network:${networkSource}`, 20, now)
      await consumeSendBudget(tx, `phone:${phone}`, 5, now)
      const previous = await tx.verification.findFirst({
        where: { identifier: id },
        orderBy: { createdAt: "desc" },
      })
      if (previous && now.getTime() - previous.createdAt.getTime() < 60_000)
        throw new Error("Wait one minute before requesting another code.")
      await tx.verification.deleteMany({ where: { identifier: id } })
      await tx.verification.create({
        data: { identifier: id, expiresAt, value: JSON.stringify(challenge) },
      })
    },
    { ...transactionOptions },
  )
  return { code, phone, expiresAt }
}

export async function verifyPhoneOtp(
  db: PrismaClient,
  input: { phone: string; mode: PhoneOtpRequest["mode"]; code: string },
  now = new Date(),
) {
  const phone = normalizeAuthPhone(input.phone)
  const id = identifier(phone, input.mode)
  const result = await db.$transaction(
    async (tx) => {
      const row = await tx.verification.findFirst({
        where: { identifier: id },
        orderBy: { createdAt: "desc" },
      })
      if (!row || row.expiresAt.getTime() <= now.getTime())
        return { error: "The code expired. Request a new code." } as const
      let challenge: Challenge
      try {
        challenge = JSON.parse(row.value)
      } catch {
        return { error: "Request a new verification code." } as const
      }
      if (
        !challenge.draft ||
        challenge.draft.phone !== phone ||
        challenge.draft.mode !== input.mode ||
        !Number.isInteger(challenge.attempts) ||
        challenge.attempts < 0 ||
        !/^[a-f0-9]{64}$/.test(challenge.codeHash)
      )
        return { error: "Request a new verification code." } as const
      if (challenge.attempts >= 5)
        return {
          error: "Too many incorrect codes. Request a new code.",
        } as const
      const expected = Buffer.from(challenge.codeHash, "hex")
      const actual = Buffer.from(digest(`${id}:${input.code}`), "hex")
      if (!/^\d{6}$/.test(input.code) || !timingSafeEqual(expected, actual)) {
        challenge.attempts += 1
        await tx.verification.update({
          where: { id: row.id },
          data: { value: JSON.stringify(challenge) },
        })
        return { error: "The verification code is incorrect." } as const
      }
      const draft = challenge.draft
      const legal =
        draft.mode === "sign_up"
          ? resolveLegalSignupChoice(draft, currentEffectiveLegalPublication())
          : null
      if ((legal?.documentHash ?? null) !== challenge.legalDocumentHash)
        throw new Error("The Terms changed. Restart signup and review them.")
      let user = await tx.user.findUnique({
        where: { phone },
        select: { id: true, phoneVerifiedAt: true },
      })
      if (draft.mode === "login" && !user?.phoneVerifiedAt)
        return {
          error: "Use your existing sign-in method, or create a phone account.",
        } as const
      if (draft.mode === "sign_up") {
        if (user)
          return {
            error: "Use your existing sign-in method for this account.",
          } as const
        if (!draft.ageBand || draft.ageBand === AccountAgeBand.UNDECLARED)
          throw new Error("Choose an eligible age range.")
        user = await tx.user.create({
          data: {
            name: draft.name?.trim() || "Store Owner",
            displayName: draft.name?.trim() || "Store Owner",
            // Internal non-deliverable identity; never claims email ownership.
            email: `${randomUUID()}@phone.ewatrade.invalid`,
            emailVerified: false,
            phone,
            phoneVerifiedAt: now,
            ageBand: draft.ageBand,
            ageDeclaredAt: now,
          },
          select: { id: true, phoneVerifiedAt: true },
        })
        await createOwnerSignupBusiness(tx, {
          ...draft,
          userId: user.id,
          businessName: draft.businessName?.trim() || "My Business",
          currencyCode: normalizeOperatingCurrencyCode(draft.currencyCode),
        })
        if (legal)
          await recordLegalAcceptance(tx, {
            userId: user.id,
            version: legal.version,
            surface: "mobile",
          })
      }
      if (!user) throw new Error("Unable to verify this account.")
      const consumed = await tx.verification.deleteMany({
        where: { id: row.id },
      })
      if (consumed.count !== 1)
        throw new Error("This code has already been used.")
      const session = await createMobileSessionForVerifiedUser(
        tx,
        user.id,
        "phone",
      )
      return { session } as const
    },
    { ...transactionOptions },
  )
  // Incorrect attempts must commit before returning a public failure.
  if ("error" in result) throw new Error(result.error)
  return result.session
}
