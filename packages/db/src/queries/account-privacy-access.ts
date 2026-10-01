import { randomUUID } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { mobileOtpIdentifiersForEmail } from "./mobile-otp-identifier"

const leaseMs = 10 * 60_000
const maximumAttempts = 5
const maximumAppleAccounts = 20
const maximumGoogleAccounts = 20

export class AccountPrivacyAccessError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "IDENTITY_REVIEW_REQUIRED"
      | "OWNER_HANDOVER_REQUIRED"
      | "REVIEW_REQUIRED"
      | "ALREADY_CLAIMED"
      | "RETRY_LIMIT"
      | "CLAIM_CONFLICT"
      | "APPLE_ACCOUNT_LIMIT"
      | "APPLE_REVOKE_FAILED"
      | "GOOGLE_ACCOUNT_LIMIT"
      | "GOOGLE_REVOKE_FAILED"
      | "DISABLED"
      | "OPERATOR_REQUIRED"
      | "ACCESS_REMAINS",
  ) {
    super(code.replaceAll("_", " ").toLowerCase())
    this.name = "AccountPrivacyAccessError"
  }
}

/** A processing request blocks fresh sessions even if provider revocation needs retry. */
export async function isAccountPrivacyAccessBlocked(
  db: Pick<PrismaClient, "accountPrivacyRequest">,
  userId: string,
) {
  const request = await db.accountPrivacyRequest.findUnique({
    where: { requestKey: `account-deletion:${userId}` },
    select: { status: true },
  })
  return request?.status === "PROCESSING" || request?.status === "COMPLETED"
}

export async function beginAccountPrivacyReview(
  db: PrismaClient,
  input: { requestId: string; reviewerUserId: string },
) {
  return db.$transaction(async (tx) => {
    const reviewer = await tx.user.findUnique({
      where: { id: input.reviewerUserId },
      select: { isPlatformAdmin: true },
    })
    if (!reviewer?.isPlatformAdmin)
      throw new AccountPrivacyAccessError("OPERATOR_REQUIRED")
    const request = await tx.accountPrivacyRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        status: true,
        userId: true,
        verifiedSubjectUserId: true,
        verifiedAt: true,
      },
    })
    if (!request) throw new AccountPrivacyAccessError("NOT_FOUND")
    if (!request.userId || !request.verifiedAt)
      throw new AccountPrivacyAccessError("IDENTITY_REVIEW_REQUIRED")
    if (request.userId === input.reviewerUserId)
      throw new AccountPrivacyAccessError("OPERATOR_REQUIRED")
    if (
      request.verifiedSubjectUserId &&
      request.verifiedSubjectUserId !== request.userId
    )
      throw new AccountPrivacyAccessError("IDENTITY_REVIEW_REQUIRED")
    if (request.status !== "RECEIVED" && request.status !== "UNDER_REVIEW")
      throw new AccountPrivacyAccessError("REVIEW_REQUIRED")
    const stage = await tx.accountPrivacyAccessRevocation.upsert({
      where: { requestId: request.id },
      create: {
        requestId: request.id,
        userId: request.userId,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
      },
      update: {},
      select: { reviewedByUserId: true, status: true, userId: true },
    })
    if (
      stage.userId !== request.userId ||
      stage.status !== "PENDING" ||
      stage.reviewedByUserId !== input.reviewerUserId
    ) {
      throw new AccountPrivacyAccessError("REVIEW_REQUIRED")
    }
    if (!request.verifiedSubjectUserId) {
      const bound = await tx.accountPrivacyRequest.updateMany({
        where: {
          id: request.id,
          userId: request.userId,
          verifiedSubjectUserId: null,
        },
        data: { verifiedSubjectUserId: request.userId },
      })
      if (bound.count !== 1)
        throw new AccountPrivacyAccessError("CLAIM_CONFLICT")
    }
    if (request.status === "RECEIVED") {
      const changed = await tx.accountPrivacyRequest.updateMany({
        where: { id: request.id, status: "RECEIVED" },
        data: { status: "UNDER_REVIEW" },
      })
      if (changed.count !== 1)
        throw new AccountPrivacyAccessError("CLAIM_CONFLICT")
    }
    return { requestId: request.id, status: "UNDER_REVIEW" as const }
  })
}

async function assertOwnerHandoverComplete(db: PrismaClient, userId: string) {
  const owned = await db.membership.findMany({
    where: { userId, role: "OWNER", status: "ACTIVE" },
    select: { tenantId: true },
  })
  for (const membership of owned) {
    const otherOwners = await db.membership.count({
      where: {
        tenantId: membership.tenantId,
        userId: { not: userId },
        role: "OWNER",
        status: "ACTIVE",
      },
    })
    if (otherOwners === 0)
      throw new AccountPrivacyAccessError("OWNER_HANDOVER_REQUIRED")
  }
}

type RevokeApple = (
  encryptedRefreshToken: string,
  clientId: string,
) => Promise<void>
type RevokeAppleAccess = (
  accessToken: string,
  clientId: string,
) => Promise<void>
type RevokeGoogle = (token: string) => Promise<void>

type AccessCountDb = Pick<
  PrismaClient,
  "session" | "account" | "storeConversationPushEndpoint"
>

async function countAccountAccess(
  db: AccessCountDb,
  userId: string,
  now: Date,
) {
  // This helper also runs on the one connection held by a serializable
  // transaction. Keep its bounded reads sequential for pg adapter safety.
  const sessions = await db.session.count({
    where: { userId, expiresAt: { gt: now } },
  })
  const appleTokens = await db.account.count({
    where: { userId, provider: "apple", refreshToken: { not: null } },
  })
  const pushEndpoints = await db.storeConversationPushEndpoint.count({
    where: { accountUserId: userId, status: "ACTIVE" },
  })
  const identityTokens = await db.account.count({
    where: { userId, idToken: { not: null } },
  })
  const allProviderTokens = await db.account.count({
    where: {
      userId,
      OR: [{ accessToken: { not: null } }, { refreshToken: { not: null } }],
    },
  })
  // The Apple loop handles exactly the rows counted by appleTokens. Any
  // remaining token-bearing row, including Apple access-token-only rows,
  // needs a separate confirmed revocation path.
  return {
    sessions,
    appleTokens,
    pushEndpoints,
    identityTokens,
    otherProviderTokens: allProviderTokens - appleTokens,
  }
}

async function assertNoAccountAccess(
  db: AccessCountDb,
  userId: string,
  now: Date,
) {
  const counts = await countAccountAccess(db, userId, now)
  if (
    counts.sessions ||
    counts.appleTokens ||
    counts.pushEndpoints ||
    counts.identityTokens ||
    counts.otherProviderTokens
  )
    throw new AccountPrivacyAccessError("ACCESS_REMAINS")
}

async function clearMobileOtpForEmail(db: PrismaClient, email: string) {
  const identifiers = mobileOtpIdentifiersForEmail(email)
  await db.verification.deleteMany({
    where: { identifier: { in: identifiers } },
  })
  const remaining = await db.verification.count({
    where: { identifier: { in: identifiers } },
  })
  if (remaining > 0) throw new AccountPrivacyAccessError("ACCESS_REMAINS")
}

/** Revokes access only. The parent deletion request deliberately stays PROCESSING. */
export async function revokeAccountPrivacyAccess(
  db: PrismaClient,
  input: {
    requestId: string
    operatorUserId: string
    revokeApple: RevokeApple
    revokeAppleAccess?: RevokeAppleAccess
    revokeGoogle?: RevokeGoogle
    now?: Date
  },
) {
  if (process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true")
    throw new AccountPrivacyAccessError("DISABLED")
  const operator = await db.user.findUnique({
    where: { id: input.operatorUserId },
    select: { isPlatformAdmin: true },
  })
  if (!operator?.isPlatformAdmin)
    throw new AccountPrivacyAccessError("OPERATOR_REQUIRED")
  const now = input.now ?? new Date()
  const request = await db.accountPrivacyRequest.findUnique({
    where: { id: input.requestId },
    select: {
      id: true,
      userId: true,
      verifiedSubjectUserId: true,
      status: true,
      verifiedAt: true,
      user: { select: { email: true } },
    },
  })
  if (!request) throw new AccountPrivacyAccessError("NOT_FOUND")
  if (!request.userId || !request.verifiedAt || !request.user?.email)
    throw new AccountPrivacyAccessError("IDENTITY_REVIEW_REQUIRED")
  if (request.userId === input.operatorUserId)
    throw new AccountPrivacyAccessError("OPERATOR_REQUIRED")
  if (request.verifiedSubjectUserId !== request.userId)
    throw new AccountPrivacyAccessError("IDENTITY_REVIEW_REQUIRED")
  if (request.status !== "UNDER_REVIEW" && request.status !== "PROCESSING")
    throw new AccountPrivacyAccessError("REVIEW_REQUIRED")
  const currentStage = await db.accountPrivacyAccessRevocation.findUnique({
    where: { requestId: request.id },
    select: { status: true, userId: true },
  })
  if (
    currentStage?.status === "REVOKED" &&
    currentStage.userId === request.userId
  ) {
    const counts = await countAccountAccess(db, request.userId, now)
    if (
      !counts.sessions &&
      !counts.appleTokens &&
      !counts.pushEndpoints &&
      !counts.identityTokens &&
      !counts.otherProviderTokens
    ) {
      // A new or expired mobile OTP may exist even when the audited access
      // stage is already REVOKED. Purge only the verified subject's exact keys.
      await clearMobileOtpForEmail(db, request.user.email)
      return {
        requestId: request.id,
        accessRevoked: true,
        replay: true,
        recovered: false,
      }
    }
  }
  await assertOwnerHandoverComplete(db, request.userId)

  const appleAccounts = await db.account.findMany({
    where: {
      userId: request.userId,
      provider: "apple",
      OR: [{ accessToken: { not: null } }, { refreshToken: { not: null } }],
    },
    select: { id: true, accessToken: true, refreshToken: true, scope: true },
    take: maximumAppleAccounts + 1,
  })
  if (appleAccounts.length > maximumAppleAccounts)
    throw new AccountPrivacyAccessError("APPLE_ACCOUNT_LIMIT")
  if (appleAccounts.some((account) => !account.scope))
    throw new AccountPrivacyAccessError("APPLE_REVOKE_FAILED")
  const googleAccounts = await db.account.findMany({
    where: {
      userId: request.userId,
      provider: "google",
      OR: [{ accessToken: { not: null } }, { refreshToken: { not: null } }],
    },
    select: { id: true, accessToken: true, refreshToken: true },
    take: maximumGoogleAccounts + 1,
  })
  if (googleAccounts.length > maximumGoogleAccounts)
    throw new AccountPrivacyAccessError("GOOGLE_ACCOUNT_LIMIT")

  const claimId = randomUUID()
  const claim = await db.$transaction(
    async (tx) => {
      const currentOperator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!currentOperator?.isPlatformAdmin)
        throw new AccountPrivacyAccessError("OPERATOR_REQUIRED")
      const currentRequest = await tx.accountPrivacyRequest.findUnique({
        where: { id: request.id },
        select: {
          userId: true,
          verifiedSubjectUserId: true,
          verifiedAt: true,
          status: true,
        },
      })
      if (
        currentRequest?.userId !== request.userId ||
        currentRequest.verifiedSubjectUserId !== request.userId ||
        !currentRequest.verifiedAt ||
        (currentRequest.status !== "UNDER_REVIEW" &&
          currentRequest.status !== "PROCESSING")
      )
        throw new AccountPrivacyAccessError("IDENTITY_REVIEW_REQUIRED")
      const stage = await tx.accountPrivacyAccessRevocation.findUnique({
        where: { requestId: request.id },
      })
      if (!stage || stage.userId !== request.userId || !stage.reviewedAt)
        throw new AccountPrivacyAccessError("REVIEW_REQUIRED")
      const recoveryCounts =
        stage.status === "REVOKED"
          ? await countAccountAccess(tx, request.userId, now)
          : null
      if (
        recoveryCounts &&
        !recoveryCounts.sessions &&
        !recoveryCounts.appleTokens &&
        !recoveryCounts.pushEndpoints &&
        !recoveryCounts.identityTokens &&
        !recoveryCounts.otherProviderTokens
      )
        return null
      if (stage.attempts >= maximumAttempts)
        throw new AccountPrivacyAccessError("RETRY_LIMIT")
      if (
        stage.status === "PROCESSING" &&
        stage.claimExpiresAt &&
        stage.claimExpiresAt > now
      )
        throw new AccountPrivacyAccessError("ALREADY_CLAIMED")
      const result = await tx.accountPrivacyAccessRevocation.updateMany({
        where: {
          requestId: request.id,
          status: stage.status,
          updatedAt: stage.updatedAt,
        },
        data: {
          attempts: { increment: 1 },
          claimedByUserId: input.operatorUserId,
          claimId,
          claimExpiresAt: new Date(now.getTime() + leaseMs),
          failureCode: null,
          status: "PROCESSING",
        },
      })
      if (result.count !== 1)
        throw new AccountPrivacyAccessError("CLAIM_CONFLICT")
      const parent = await tx.accountPrivacyRequest.updateMany({
        where: {
          id: request.id,
          userId: request.userId,
          verifiedSubjectUserId: request.userId,
          status: { in: ["UNDER_REVIEW", "PROCESSING"] },
        },
        data: { status: "PROCESSING" },
      })
      if (parent.count !== 1)
        throw new AccountPrivacyAccessError("CLAIM_CONFLICT")
      if (recoveryCounts) {
        await tx.accountPrivacyAccessRecoveryEvent.create({
          data: {
            stageId: stage.id,
            requestId: request.id,
            userId: request.userId,
            operatorUserId: input.operatorUserId,
            claimId,
            activeSessions: recoveryCounts.sessions,
            appleAuthorizations: recoveryCounts.appleTokens,
            activePushEndpoints: recoveryCounts.pushEndpoints,
            storedIdentityTokens: recoveryCounts.identityTokens,
            otherProviderTokens: recoveryCounts.otherProviderTokens,
            claimedAt: now,
          },
        })
      }
      return { recovered: Boolean(recoveryCounts) }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
  if (!claim) {
    await assertNoAccountAccess(db, request.userId, now)
    return {
      requestId: request.id,
      accessRevoked: true,
      replay: true,
      recovered: false,
    }
  }

  try {
    await db.session.deleteMany({ where: { userId: request.userId } })
    await db.storeConversationPushEndpoint.updateMany({
      where: { accountUserId: request.userId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date() },
    })
    const sessionStage = await db.accountPrivacyAccessRevocation.updateMany({
      where: { requestId: request.id, claimId, status: "PROCESSING" },
      data: { sessionsRevokedAt: new Date() },
    })
    if (sessionStage.count !== 1)
      throw new AccountPrivacyAccessError("CLAIM_CONFLICT")
    for (const account of appleAccounts) {
      if (!account.scope)
        throw new AccountPrivacyAccessError("APPLE_REVOKE_FAILED")
      try {
        if (account.refreshToken)
          await input.revokeApple(account.refreshToken, account.scope)
        else if (account.accessToken && input.revokeAppleAccess)
          await input.revokeAppleAccess(account.accessToken, account.scope)
        else throw new AccountPrivacyAccessError("APPLE_REVOKE_FAILED")
      } catch {
        throw new AccountPrivacyAccessError("APPLE_REVOKE_FAILED")
      }
      await db.account.updateMany({
        where: {
          id: account.id,
          userId: request.userId,
          refreshToken: account.refreshToken,
          accessToken: account.accessToken,
        },
        data: { refreshToken: null, accessToken: null, idToken: null },
      })
    }
    for (const account of googleAccounts) {
      const token = account.refreshToken ?? account.accessToken
      if (!token || !input.revokeGoogle)
        throw new AccountPrivacyAccessError("GOOGLE_REVOKE_FAILED")
      try {
        await input.revokeGoogle(token)
      } catch {
        throw new AccountPrivacyAccessError("GOOGLE_REVOKE_FAILED")
      }
      await db.account.updateMany({
        where: {
          id: account.id,
          userId: request.userId,
          accessToken: account.accessToken,
          refreshToken: account.refreshToken,
        },
        data: { accessToken: null, refreshToken: null, idToken: null },
      })
    }
    // The Google mobile login path stores an ID token only; it is no longer
    // needed once the verified account has entered privacy processing.
    await db.account.updateMany({
      where: { userId: request.userId, idToken: { not: null } },
      data: { idToken: null },
    })
    await db.session.deleteMany({ where: { userId: request.userId } })
    await clearMobileOtpForEmail(db, request.user.email)
    await assertNoAccountAccess(db, request.userId, now)
    const completed = await db.accountPrivacyAccessRevocation.updateMany({
      where: { requestId: request.id, claimId, status: "PROCESSING" },
      data: {
        status: "REVOKED",
        claimId: null,
        claimExpiresAt: null,
        appleRevokedAt: new Date(),
        completedAt: new Date(),
      },
    })
    if (completed.count !== 1)
      throw new AccountPrivacyAccessError("CLAIM_CONFLICT")
    return {
      requestId: request.id,
      accessRevoked: true,
      replay: false,
      recovered: claim.recovered,
    }
  } catch (error) {
    await db.accountPrivacyAccessRevocation.updateMany({
      where: { requestId: request.id, claimId, status: "PROCESSING" },
      data: {
        status: "FAILED",
        claimId: null,
        claimExpiresAt: null,
        failureCode:
          error instanceof AccountPrivacyAccessError
            ? error.code
            : "ACCESS_REMAINS",
      },
    })
    throw error instanceof AccountPrivacyAccessError
      ? error
      : new AccountPrivacyAccessError("ACCESS_REMAINS")
  }
}
