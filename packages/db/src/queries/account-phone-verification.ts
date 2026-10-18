import { randomInt, timingSafeEqual } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { isAccountPrivacyAccessBlocked } from "./account-privacy-access"
import { consumePhoneOtpSendBudget, normalizeAuthPhone } from "./phone-auth"
import { isLocalPhoneAuth } from "./phone-auth-profile"
import { phoneAuthDigest } from "./phone-otp-identifier"
import type { DbClient } from "./types"

export type AccountPhoneActor = { userId: string; sessionId: string }
export class AccountPhoneVerificationError extends Error {
  constructor(
    readonly code: "UNAUTHORIZED" | "BAD_REQUEST" | "TOO_MANY_REQUESTS",
    message: string,
  ) {
    super(message)
  }
}
const options = {
  isolationLevel: "Serializable" as const,
  maxWait: 10_000,
  timeout: 30_000,
}
const prefix = "phone-auth:verify-account:"
function challengeIdentifier(actor: AccountPhoneActor, phone: string) {
  return (
    prefix +
    phoneAuthDigest(JSON.stringify([actor.userId, actor.sessionId, phone]))
  )
}

async function requireSubject(
  db: DbClient,
  actor: AccountPhoneActor,
  now: Date,
): Promise<string> {
  const session = await db.session.findUnique({
    where: { id: actor.sessionId },
    select: {
      userId: true,
      createdAt: true,
      expiresAt: true,
      token: true,
      qaAuthorizationId: true,
    },
  })
  const created = session?.createdAt.getTime() ?? Number.NaN
  const age = now.getTime() - created
  if (
    !session ||
    session.userId !== actor.userId ||
    session.qaAuthorizationId ||
    session.token.startsWith("qas_") ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 15 * 60_000 ||
    session.expiresAt.getTime() <= now.getTime()
  )
    throw new AccountPhoneVerificationError(
      "UNAUTHORIZED",
      "Sign in again with your existing account before verifying your phone.",
    )
  if (await isAccountPrivacyAccessBlocked(db, actor.userId))
    throw new AccountPhoneVerificationError(
      "UNAUTHORIZED",
      "This account is no longer available for sign-in.",
    )
  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: { phone: true, phoneVerifiedAt: true, emailVerified: true },
  })
  if (!user?.emailVerified || !user.phone || user.phoneVerifiedAt)
    throw new AccountPhoneVerificationError(
      "BAD_REQUEST",
      "Use an existing verified-email account with an unverified phone number.",
    )
  return normalizeAuthPhone(user.phone)
}

export async function getAccountPhoneVerificationStatus(
  db: DbClient,
  userId: string,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { phone: true, phoneVerifiedAt: true, emailVerified: true },
  })
  return {
    phone: user?.phone ?? null,
    verified: Boolean(user?.phoneVerifiedAt),
    canVerify: Boolean(
      user?.emailVerified && user.phone && !user.phoneVerifiedAt,
    ),
  }
}

/** Verifies only the phone already attached to this authenticated account. */
export async function createAccountPhoneChallenge(
  db: PrismaClient,
  actor: AccountPhoneActor,
  network: string,
  now = new Date(),
): Promise<{
  phone: string
  code: string
  expiresAt: Date
  identifier: string
  value: string
}> {
  if (!network.trim())
    throw new AccountPhoneVerificationError(
      "BAD_REQUEST",
      "Phone verification is temporarily unavailable.",
    )
  const code = isLocalPhoneAuth()
    ? "123456"
    : randomInt(0, 1_000_000).toString().padStart(6, "0")
  const expiresAt = new Date(now.getTime() + 5 * 60_000)
  return db.$transaction(
    async (tx) => {
      const phone = await requireSubject(tx, actor, now)
      const identifier = challengeIdentifier(actor, phone)
      try {
        await consumePhoneOtpSendBudget(tx, "global", 100, now)
        await consumePhoneOtpSendBudget(tx, `network:${network}`, 20, now)
        await consumePhoneOtpSendBudget(tx, `phone:${phone}`, 5, now)
        await consumePhoneOtpSendBudget(
          tx,
          `account-verification:${actor.userId}`,
          5,
          now,
        )
      } catch {
        throw new AccountPhoneVerificationError(
          "TOO_MANY_REQUESTS",
          "Too many codes requested. Try again later.",
        )
      }
      const previous = await tx.verification.findFirst({
        where: { identifier },
        orderBy: { createdAt: "desc" },
      })
      if (previous && now.getTime() - previous.createdAt.getTime() < 60_000)
        throw new AccountPhoneVerificationError(
          "TOO_MANY_REQUESTS",
          "Wait one minute before requesting another code.",
        )
      const value = JSON.stringify({
        attempts: 0,
        codeHash: phoneAuthDigest(`${identifier}:${code}`),
      })
      await tx.verification.deleteMany({ where: { identifier } })
      await tx.verification.create({ data: { identifier, value, expiresAt } })
      return { phone, code, expiresAt, identifier, value }
    },
    { ...options },
  )
}

export async function discardAccountPhoneChallenge(
  db: PrismaClient,
  issued: { identifier: string; value: string },
) {
  await db.verification.deleteMany({
    where: { identifier: issued.identifier, value: issued.value },
  })
}

export async function verifyAccountPhoneChallenge(
  db: PrismaClient,
  actor: AccountPhoneActor,
  code: string,
  now = new Date(),
): Promise<{ verified: true }> {
  const result = await db.$transaction<{ error: string } | { verified: true }>(
    async (tx) => {
      const phone = await requireSubject(tx, actor, now)
      const identifier = challengeIdentifier(actor, phone)
      const row = await tx.verification.findFirst({
        where: { identifier },
        orderBy: { createdAt: "desc" },
      })
      if (!row || row.expiresAt.getTime() <= now.getTime())
        return { error: "The code expired. Request a new code." } as const
      let challenge: { attempts: number; codeHash: string }
      try {
        challenge = JSON.parse(row.value)
      } catch {
        return { error: "Request a new verification code." } as const
      }
      if (
        !challenge ||
        !Number.isInteger(challenge.attempts) ||
        challenge.attempts < 0 ||
        !/^[a-f0-9]{64}$/.test(challenge.codeHash)
      )
        return { error: "Request a new verification code." } as const
      if (challenge.attempts >= 5)
        return {
          error: "Too many incorrect codes. Request a new code.",
        } as const
      const actual = Buffer.from(
        phoneAuthDigest(`${identifier}:${code}`),
        "hex",
      )
      if (
        !/^\d{6}$/.test(code) ||
        !timingSafeEqual(Buffer.from(challenge.codeHash, "hex"), actual)
      ) {
        await tx.verification.update({
          where: { id: row.id },
          data: {
            value: JSON.stringify({
              ...challenge,
              attempts: challenge.attempts + 1,
            }),
          },
        })
        return { error: "The verification code is incorrect." } as const
      }
      const changed = await tx.user.updateMany({
        where: {
          id: actor.userId,
          phone,
          emailVerified: true,
          phoneVerifiedAt: null,
        },
        data: { phoneVerifiedAt: now },
      })
      if (changed.count !== 1)
        throw new AccountPhoneVerificationError(
          "BAD_REQUEST",
          "Your account changed. Request a new code.",
        )
      const consumed = await tx.verification.deleteMany({
        where: { id: row.id },
      })
      if (consumed.count !== 1)
        throw new AccountPhoneVerificationError(
          "BAD_REQUEST",
          "This code has already been used.",
        )
      return { verified: true as const }
    },
    { ...options },
  )
  // Incorrect attempts commit; throwing inside the transaction would reset them.
  if ("error" in result)
    throw new AccountPhoneVerificationError("BAD_REQUEST", result.error)
  return result
}
