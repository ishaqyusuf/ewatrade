import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  beginAccountPrivacyReview,
  isAccountPrivacyAccessBlocked,
  revokeAccountPrivacyAccess,
} from "./account-privacy-access"

function fixture(input?: {
  ownerWithoutSuccessor?: boolean
  userId?: string | null
  verifiedSubjectUserId?: string | null
  operatorIsAdmin?: boolean
}) {
  const calls: string[] = []
  const recoveryEvents: Array<Record<string, unknown>> = []
  let claimOptions: unknown
  const request = {
    id: "request-1",
    requestKey: "account-deletion:user-1",
    userId: input?.userId === undefined ? "user-1" : input.userId,
    verifiedSubjectUserId:
      input?.verifiedSubjectUserId === undefined
        ? "user-1"
        : input.verifiedSubjectUserId,
    status: "RECEIVED",
    verifiedAt: new Date("2026-09-24T12:00:00.000Z"),
    user: { email: "user@example.test" },
  }
  let stage: Record<string, unknown> | null = null
  let appleToken: string | null = "encrypted-token"
  let identityToken: string | null = "google-id-token"
  let otherProviderToken: string | null = null
  let appleAccessOnlyToken: string | null = null
  let sessionsActive = true
  let pushActive = true
  let mobileOtpStored = false
  const verificationQueries: unknown[] = []
  let readsUntilSubjectChange = 0
  let claimConflictPending = false
  let recoveryAuditFailurePending = false
  const db = {
    $transaction: async (
      operation: (tx: unknown) => Promise<unknown>,
      options?: unknown,
    ) => {
      claimOptions = options
      const stageBefore = stage ? { ...stage } : null
      const requestBefore = { ...request }
      const eventCountBefore = recoveryEvents.length
      try {
        return await operation(db)
      } catch (error) {
        stage = stageBefore
        Object.assign(request, requestBefore)
        recoveryEvents.length = eventCountBefore
        throw error
      }
    },
    user: {
      findUnique: async () => ({
        isPlatformAdmin: input?.operatorIsAdmin ?? true,
      }),
    },
    accountPrivacyRequest: {
      findUnique: async () => {
        if (readsUntilSubjectChange > 0) {
          readsUntilSubjectChange -= 1
          if (readsUntilSubjectChange === 0)
            request.verifiedSubjectUserId = "another-user"
        }
        return { ...request }
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          status?: string | { in: string[] }
          verifiedSubjectUserId?: null
        }
        data: { status?: string; verifiedSubjectUserId?: string }
      }) => {
        const allowed =
          where.status === undefined
            ? true
            : typeof where.status === "string"
              ? request.status === where.status
              : where.status.in.includes(request.status)
        if (
          !allowed ||
          (where.verifiedSubjectUserId === null &&
            request.verifiedSubjectUserId !== null)
        )
          return { count: 0 }
        if (data.status) {
          request.status = data.status
          calls.push(`request:${data.status}`)
        }
        if (data.verifiedSubjectUserId)
          request.verifiedSubjectUserId = data.verifiedSubjectUserId
        return { count: 1 }
      },
    },
    accountPrivacyAccessRevocation: {
      findUnique: async () => stage,
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        stage ??= {
          id: "stage-1",
          ...create,
          status: "PENDING",
          attempts: 0,
          updatedAt: new Date("2026-09-24T12:00:00.000Z"),
        }
        return { ...stage }
      },
      updateMany: async ({
        where,
        data,
      }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (claimConflictPending && data.status === "PROCESSING") {
          claimConflictPending = false
          return { count: 0 }
        }
        if (!stage || (where.status && stage.status !== where.status))
          return { count: 0 }
        if (where.claimId && stage.claimId !== where.claimId)
          return { count: 0 }
        if (where.updatedAt && stage.updatedAt !== where.updatedAt)
          return { count: 0 }
        stage = {
          ...stage,
          ...data,
          attempts:
            typeof data.attempts === "object" && data.attempts !== null
              ? Number(stage.attempts) + 1
              : stage.attempts,
          updatedAt: new Date(),
        }
        calls.push(`stage:${stage.status}`)
        return { count: 1 }
      },
    },
    accountPrivacyAccessRecoveryEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (recoveryAuditFailurePending) {
          recoveryAuditFailurePending = false
          throw new Error("Fixture recovery audit failure")
        }
        recoveryEvents.push(data)
        calls.push("recovery-audited")
        return data
      },
    },
    membership: {
      findMany: async () =>
        input?.ownerWithoutSuccessor ? [{ tenantId: "tenant-1" }] : [],
      count: async () => 0,
    },
    account: {
      findMany: async ({ where }: { where: { provider: string } }) => {
        if (where.provider === "google")
          return otherProviderToken
            ? [
                {
                  id: "google-1",
                  accessToken: null,
                  refreshToken: otherProviderToken,
                },
              ]
            : []
        return [
          ...(appleToken
            ? [
                {
                  id: "apple-1",
                  accessToken: null,
                  refreshToken: appleToken,
                  scope: "com.ewatrade.app",
                },
              ]
            : []),
          ...(appleAccessOnlyToken
            ? [
                {
                  id: "apple-access-only",
                  accessToken: appleAccessOnlyToken,
                  refreshToken: null,
                  scope: "com.ewatrade.app",
                },
              ]
            : []),
        ]
      },
      updateMany: async ({
        where,
      }: {
        where: {
          id?: string
          refreshToken?: string | null
          accessToken?: string | null
          idToken?: { not: null }
        }
      }) => {
        if (where.idToken) {
          const count = Number(Boolean(identityToken))
          identityToken = null
          calls.push("identity-tokens-cleared")
          return { count }
        }
        if (where.id === "google-1") {
          if (otherProviderToken !== where.refreshToken) return { count: 0 }
          otherProviderToken = null
          calls.push("google-token-cleared")
          return { count: 1 }
        }
        if (where.id === "apple-access-only") {
          if (appleAccessOnlyToken !== where.accessToken) return { count: 0 }
          appleAccessOnlyToken = null
          calls.push("apple-access-token-cleared")
          return { count: 1 }
        }
        if (appleToken !== where.refreshToken) return { count: 0 }
        appleToken = null
        calls.push("apple-token-cleared")
        return { count: 1 }
      },
      count: async ({ where }: { where: Record<string, unknown> }) =>
        where.idToken
          ? Number(Boolean(identityToken))
          : where.OR
            ? Number(Boolean(appleToken)) +
              Number(Boolean(otherProviderToken)) +
              Number(Boolean(appleAccessOnlyToken))
            : Number(Boolean(appleToken)),
    },
    session: {
      deleteMany: async () => {
        sessionsActive = false
        calls.push("sessions-revoked")
        return { count: 2 }
      },
      count: async () => Number(sessionsActive),
    },
    verification: {
      deleteMany: async (query: unknown) => {
        verificationQueries.push(query)
        const count = Number(mobileOtpStored)
        mobileOtpStored = false
        return { count }
      },
      count: async (query: unknown) => {
        verificationQueries.push(query)
        return Number(mobileOtpStored)
      },
    },
    storeConversationPushEndpoint: {
      updateMany: async () => {
        pushActive = false
        calls.push("push-revoked")
        return { count: 1 }
      },
      count: async () => Number(pushActive),
    },
  }
  return {
    client: db as unknown as PrismaClient,
    calls,
    request,
    getStage: () => stage,
    getRecoveryEvents: () => recoveryEvents,
    getVerificationQueries: () => verificationQueries,
    getClaimOptions: () => claimOptions,
    setStage: (data: Record<string, unknown>) => {
      if (!stage) throw new Error("Stage is unavailable")
      stage = { ...stage, ...data }
    },
    conflictNextClaim: () => {
      claimConflictPending = true
    },
    failNextRecoveryAudit: () => {
      recoveryAuditFailurePending = true
    },
    reactivatePush: () => {
      pushActive = true
    },
    reactivateSession: () => {
      sessionsActive = true
    },
    restoreMobileOtp: () => {
      mobileOtpStored = true
    },
    restoreAppleToken: () => {
      appleToken = "new-encrypted-token"
    },
    restoreIdentityToken: () => {
      identityToken = "new-google-id-token"
    },
    restoreOtherProviderToken: () => {
      otherProviderToken = "new-google-refresh-token"
    },
    restoreAppleAccessOnlyToken: () => {
      appleAccessOnlyToken = "new-apple-access-token"
    },
    changeSubjectDuringClaim: () => {
      readsUntilSubjectChange = 2
    },
  }
}

const previousFlag = process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED
beforeEach(() => {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
})
afterEach(() => {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = previousFlag
})

describe("account privacy access revocation", () => {
  test("removes mobile login/signup verification rows on first run and clean replay", async () => {
    const current = fixture()
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    current.restoreMobileOtp()
    const command = {
      requestId: "request-1",
      operatorUserId: "operator-1",
      revokeApple: async () => {},
    }
    expect(
      await revokeAccountPrivacyAccess(current.client, command),
    ).toMatchObject({
      accessRevoked: true,
      replay: false,
    })
    current.restoreMobileOtp()
    expect(
      await revokeAccountPrivacyAccess(current.client, command),
    ).toMatchObject({
      accessRevoked: true,
      replay: true,
    })
    expect(current.getVerificationQueries()).toHaveLength(4)
    for (const query of current.getVerificationQueries()) {
      expect(query).toEqual({
        where: {
          identifier: {
            in: [
              "mobile-auth:login:user@example.test",
              "mobile-auth:sign_up:user@example.test",
            ],
          },
        },
      })
    }
  })
  test("processor refuses a disabled flag and a non-admin operator", async () => {
    const current = fixture()
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "false"
    await expect(
      revokeAccountPrivacyAccess(current.client, {
        requestId: "request-1",
        operatorUserId: "operator-1",
        revokeApple: async () => {},
      }),
    ).rejects.toMatchObject({ code: "DISABLED" })
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    const nonAdmin = fixture({ operatorIsAdmin: false })
    await expect(
      beginAccountPrivacyReview(nonAdmin.client, {
        requestId: "request-1",
        reviewerUserId: "operator-1",
      }),
    ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
    await expect(
      revokeAccountPrivacyAccess(nonAdmin.client, {
        requestId: "request-1",
        operatorUserId: "operator-1",
        revokeApple: async () => {},
      }),
    ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
    const self = fixture({
      userId: "operator-1",
      verifiedSubjectUserId: "operator-1",
    })
    await expect(
      beginAccountPrivacyReview(self.client, {
        requestId: "request-1",
        reviewerUserId: "operator-1",
      }),
    ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
    await expect(
      revokeAccountPrivacyAccess(self.client, {
        requestId: "request-1",
        operatorUserId: "operator-1",
        revokeApple: async () => {},
      }),
    ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
  })
  test("requires matched verified identity and operator review", async () => {
    const unmatched = fixture({ userId: null })
    await expect(
      beginAccountPrivacyReview(unmatched.client, {
        requestId: "request-1",
        reviewerUserId: "operator-1",
      }),
    ).rejects.toMatchObject({ code: "IDENTITY_REVIEW_REQUIRED" })
    const current = fixture()
    await expect(
      revokeAccountPrivacyAccess(current.client, {
        requestId: "request-1",
        operatorUserId: "operator-1",
        revokeApple: async () => {},
      }),
    ).rejects.toMatchObject({ code: "REVIEW_REQUIRED" })
    expect(current.calls).toEqual([])
  })

  test("binds an older matched request to its immutable verified subject before review", async () => {
    const current = fixture({ verifiedSubjectUserId: null })
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    expect(current.request.verifiedSubjectUserId).toBe("user-1")
  })

  test("blocks a sole owner before access is revoked", async () => {
    const current = fixture({ ownerWithoutSuccessor: true })
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    await expect(
      revokeAccountPrivacyAccess(current.client, {
        requestId: "request-1",
        operatorUserId: "operator-1",
        revokeApple: async () => {},
      }),
    ).rejects.toMatchObject({ code: "OWNER_HANDOVER_REQUIRED" })
    expect(current.calls).toEqual(["request:UNDER_REVIEW"])
  })

  test("claim rechecks the verified subject after the initial read", async () => {
    const current = fixture()
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    current.changeSubjectDuringClaim()
    await expect(
      revokeAccountPrivacyAccess(current.client, {
        requestId: "request-1",
        operatorUserId: "operator-1",
        revokeApple: async () => {
          throw new Error("Provider must not be called")
        },
      }),
    ).rejects.toMatchObject({ code: "IDENTITY_REVIEW_REQUIRED" })
    expect(current.getStage()).toMatchObject({ status: "PENDING" })
  })

  test("revokes sessions, account push endpoint and Apple token once without completing deletion", async () => {
    const current = fixture()
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    const revoked: Array<[string, string]> = []
    const command = {
      requestId: "request-1",
      operatorUserId: "operator-1",
      revokeApple: async (token: string, clientId: string) => {
        revoked.push([token, clientId])
      },
    }
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).resolves.toEqual({
      requestId: "request-1",
      accessRevoked: true,
      replay: false,
      recovered: false,
    })
    expect(revoked).toEqual([["encrypted-token", "com.ewatrade.app"]])
    expect(current.request.status).toBe("PROCESSING")
    expect(current.getStage()).toMatchObject({
      status: "REVOKED",
      reviewedByUserId: "operator-1",
      claimedByUserId: "operator-1",
      failureCode: null,
    })
    expect(
      current.calls.filter((call) => call === "sessions-revoked"),
    ).toHaveLength(2)
    expect(current.calls).toContain("push-revoked")
    expect(current.calls).toContain("identity-tokens-cleared")
    expect(await isAccountPrivacyAccessBlocked(current.client, "user-1")).toBe(
      true,
    )
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).resolves.toMatchObject({
      replay: true,
    })
    expect(revoked).toHaveLength(1)
    current.reactivatePush()
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).resolves.toMatchObject({
      replay: false,
      recovered: true,
    })
    current.reactivateSession()
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).resolves.toMatchObject({
      replay: false,
      recovered: true,
    })
    current.restoreAppleToken()
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).resolves.toMatchObject({
      replay: false,
      recovered: true,
    })
    current.restoreIdentityToken()
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).resolves.toMatchObject({
      replay: false,
      recovered: true,
    })
    expect(current.getRecoveryEvents()).toMatchObject([
      {
        stageId: "stage-1",
        activeSessions: 0,
        appleAuthorizations: 0,
        activePushEndpoints: 1,
        storedIdentityTokens: 0,
        otherProviderTokens: 0,
      },
      {
        stageId: "stage-1",
        activeSessions: 1,
        appleAuthorizations: 0,
        activePushEndpoints: 0,
        storedIdentityTokens: 0,
        otherProviderTokens: 0,
      },
      {
        stageId: "stage-1",
        activeSessions: 0,
        appleAuthorizations: 1,
        activePushEndpoints: 0,
        storedIdentityTokens: 0,
        otherProviderTokens: 0,
      },
      {
        stageId: "stage-1",
        activeSessions: 0,
        appleAuthorizations: 0,
        activePushEndpoints: 0,
        storedIdentityTokens: 1,
        otherProviderTokens: 0,
      },
    ])
    expect(JSON.stringify(current.getRecoveryEvents())).not.toContain(
      "encrypted-token",
    )
    expect(current.getClaimOptions()).toEqual({
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 30_000,
    })
  })

  test("a stale recovery claim conflict writes no audit and can be retried", async () => {
    const current = fixture()
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    const command = {
      requestId: "request-1",
      operatorUserId: "operator-1",
      revokeApple: async () => {},
    }
    await revokeAccountPrivacyAccess(current.client, command)
    current.reactivatePush()
    current.conflictNextClaim()
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).rejects.toMatchObject({ code: "CLAIM_CONFLICT" })
    expect(current.getRecoveryEvents()).toHaveLength(0)
    expect(current.getStage()).toMatchObject({ status: "REVOKED" })
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).resolves.toMatchObject({ recovered: true })
    expect(current.getRecoveryEvents()).toHaveLength(1)
  })

  test("cannot replay success when a non-Apple provider token reappears", async () => {
    const current = fixture()
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    const command = {
      requestId: "request-1",
      operatorUserId: "operator-1",
      revokeApple: async () => {},
    }
    await revokeAccountPrivacyAccess(current.client, command)
    current.restoreOtherProviderToken()
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).rejects.toMatchObject({ code: "GOOGLE_REVOKE_FAILED" })
    expect(current.getRecoveryEvents()).toMatchObject([
      { otherProviderTokens: 1, storedIdentityTokens: 0 },
    ])
    expect(current.getStage()).toMatchObject({
      status: "FAILED",
      failureCode: "GOOGLE_REVOKE_FAILED",
    })
    const revoked: string[] = []
    await expect(
      revokeAccountPrivacyAccess(current.client, {
        ...command,
        revokeGoogle: async (token) => {
          revoked.push(token)
        },
      }),
    ).resolves.toMatchObject({ accessRevoked: true, recovered: false })
    expect(revoked).toEqual(["new-google-refresh-token"])
    expect(current.calls).toContain("google-token-cleared")
    expect(current.getStage()).toMatchObject({ status: "REVOKED" })
  })

  test("keeps Google token for retry when provider rejects revocation", async () => {
    const current = fixture()
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    current.restoreOtherProviderToken()
    await expect(
      revokeAccountPrivacyAccess(current.client, {
        requestId: "request-1",
        operatorUserId: "operator-1",
        revokeApple: async () => {},
        revokeGoogle: async () => {
          throw new Error("secret-provider-response")
        },
      }),
    ).rejects.toMatchObject({ code: "GOOGLE_REVOKE_FAILED" })
    expect(current.calls).not.toContain("google-token-cleared")
    expect(JSON.stringify(current.getStage())).not.toContain(
      "secret-provider-response",
    )
    expect(current.getStage()).toMatchObject({
      status: "FAILED",
      failureCode: "GOOGLE_REVOKE_FAILED",
    })
  })

  test("cannot replay success for an Apple access token without a refresh token", async () => {
    const current = fixture()
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    const command = {
      requestId: "request-1",
      operatorUserId: "operator-1",
      revokeApple: async () => {},
    }
    await revokeAccountPrivacyAccess(current.client, command)
    current.restoreAppleAccessOnlyToken()
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).rejects.toMatchObject({ code: "APPLE_REVOKE_FAILED" })
    expect(current.getRecoveryEvents()).toMatchObject([
      { otherProviderTokens: 1, appleAuthorizations: 0 },
    ])
    const revoked: Array<[string, string]> = []
    await expect(
      revokeAccountPrivacyAccess(current.client, {
        ...command,
        revokeAppleAccess: async (token, clientId) => {
          revoked.push([token, clientId])
        },
      }),
    ).resolves.toMatchObject({ accessRevoked: true, replay: false })
    expect(revoked).toEqual([["new-apple-access-token", "com.ewatrade.app"]])
    expect(current.calls).toContain("apple-access-token-cleared")
  })

  test("recovery audit failure rolls the stage claim back atomically", async () => {
    const current = fixture()
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    const command = {
      requestId: "request-1",
      operatorUserId: "operator-1",
      revokeApple: async () => {},
    }
    await revokeAccountPrivacyAccess(current.client, command)
    const previousAttempts = current.getStage()?.attempts
    current.reactivatePush()
    current.failNextRecoveryAudit()
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).rejects.toThrow("Fixture recovery audit failure")
    expect(current.getStage()).toMatchObject({
      status: "REVOKED",
      attempts: previousAttempts,
    })
    expect(current.getRecoveryEvents()).toHaveLength(0)
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).resolves.toMatchObject({ recovered: true })
    expect(current.getRecoveryEvents()).toHaveLength(1)
  })

  test("a live claim lease and the bounded attempt cap stop competing recovery", async () => {
    const current = fixture()
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    const now = new Date("2026-09-25T00:00:00.000Z")
    const command = {
      requestId: "request-1",
      operatorUserId: "operator-1",
      revokeApple: async () => {},
      now,
    }
    current.setStage({
      status: "PROCESSING",
      attempts: 1,
      claimExpiresAt: new Date(now.getTime() + 60_000),
    })
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).rejects.toMatchObject({ code: "ALREADY_CLAIMED" })
    current.setStage({
      claimExpiresAt: new Date(now.getTime() - 1),
      attempts: 5,
    })
    await expect(
      revokeAccountPrivacyAccess(current.client, command),
    ).rejects.toMatchObject({ code: "RETRY_LIMIT" })
    expect(current.getRecoveryEvents()).toHaveLength(0)
  })

  test("keeps a provider failure retryable without dropping the encrypted token", async () => {
    const current = fixture()
    await beginAccountPrivacyReview(current.client, {
      requestId: "request-1",
      reviewerUserId: "operator-1",
    })
    await expect(
      revokeAccountPrivacyAccess(current.client, {
        requestId: "request-1",
        operatorUserId: "operator-1",
        revokeApple: async () => {
          throw new Error("provider detail must not persist")
        },
      }),
    ).rejects.toMatchObject({ code: "APPLE_REVOKE_FAILED" })
    expect(current.getStage()).toMatchObject({
      status: "FAILED",
      failureCode: "APPLE_REVOKE_FAILED",
    })
    expect(JSON.stringify(current.getStage())).not.toContain("provider detail")
    expect(current.request.status).toBe("PROCESSING")
    await expect(
      revokeAccountPrivacyAccess(current.client, {
        requestId: "request-1",
        operatorUserId: "operator-1",
        revokeApple: async () => {},
      }),
    ).resolves.toMatchObject({ accessRevoked: true, replay: false })
  })
})
