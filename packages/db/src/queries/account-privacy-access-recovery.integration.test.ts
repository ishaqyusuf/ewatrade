import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { getAccountPrivacyReview } from "./account-privacy"
import { revokeAccountPrivacyAccess } from "./account-privacy-access"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(180_000)
const describeWithDatabase = enabled ? describe : describe.skip

describeWithDatabase(
  "account privacy access recovery on guarded Neon fixture",
  () => {
    test("reclaims stale access once under concurrent claims and cleans all evidence", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const fixtureId = randomUUID()
      const operatorUserId = randomUUID()
      const subjectUserId = randomUUID()
      const subjectEmail = `privacy-recovery-subject-${fixtureId}@example.test`
      const mobileOtpIdentifiers: [string, string] = [
        `mobile-auth:login:${subjectEmail}`,
        `mobile-auth:sign_up:${subjectEmail}`,
      ]
      const requestId = randomUUID()
      const now = new Date()
      const previousFlag = process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED
      let fixtureCreated = false
      try {
        await prisma.user.createMany({
          data: [
            {
              id: operatorUserId,
              email: `privacy-recovery-operator-${fixtureId}@example.test`,
              emailVerified: true,
              isPlatformAdmin: true,
              name: "Privacy Recovery QA Operator",
            },
            {
              id: subjectUserId,
              email: subjectEmail,
              emailVerified: true,
              name: "Privacy Recovery QA Subject",
            },
          ],
        })
        fixtureCreated = true
        await prisma.accountPrivacyRequest.create({
          data: {
            id: requestId,
            requestKey: `privacy-recovery-fixture-${fixtureId}`,
            userId: subjectUserId,
            verifiedSubjectUserId: subjectUserId,
            verifiedAt: now,
            status: "UNDER_REVIEW",
            accessRevocation: {
              create: {
                userId: subjectUserId,
                reviewedByUserId: operatorUserId,
                reviewedAt: now,
                status: "PENDING",
              },
            },
          },
        })
        expect(
          (await getAccountPrivacyReview(prisma, requestId))
            ?.conversationAccessInventory,
        ).toEqual({
          activeLinkedGuestCredentials: 0,
          activeGuestConversationGrants: 0,
          pendingAccountBridgeCapabilities: 0,
          nonRevokedAccountBridges: 0,
          pendingAccountWhatsAppCandidates: 0,
          guestOwnershipReviewRequired: false,
        })
        process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
        await prisma.verification.create({
          data: {
            identifier: mobileOtpIdentifiers[1],
            value: JSON.stringify({ businessName: "Disposable QA Business" }),
            expiresAt: new Date(Date.now() - 60_000),
          },
        })
        const command = {
          requestId,
          operatorUserId,
          revokeApple: async () => {
            throw new Error("Fixture must not call Apple")
          },
        }
        expect(await revokeAccountPrivacyAccess(prisma, command)).toMatchObject(
          {
            accessRevoked: true,
            replay: false,
            recovered: false,
          },
        )
        expect(
          await prisma.accountPrivacyAccessRecoveryEvent.count({
            where: { requestId },
          }),
        ).toBe(0)
        expect(
          await prisma.verification.count({
            where: { identifier: { in: mobileOtpIdentifiers } },
          }),
        ).toBe(0)

        await prisma.verification.create({
          data: {
            identifier: mobileOtpIdentifiers[0],
            value: JSON.stringify({ codeHash: "disposable-qa" }),
            expiresAt: new Date(Date.now() + 600_000),
          },
        })
        expect(await revokeAccountPrivacyAccess(prisma, command)).toMatchObject(
          { replay: true },
        )
        expect(
          await prisma.verification.count({
            where: { identifier: { in: mobileOtpIdentifiers } },
          }),
        ).toBe(0)

        await prisma.session.create({
          data: {
            userId: subjectUserId,
            token: `privacy-recovery-${fixtureId}-1`,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        })
        expect(await revokeAccountPrivacyAccess(prisma, command)).toMatchObject(
          {
            accessRevoked: true,
            replay: false,
            recovered: true,
          },
        )
        const firstEvent =
          await prisma.accountPrivacyAccessRecoveryEvent.findFirst({
            where: { requestId },
            select: {
              userId: true,
              operatorUserId: true,
              activeSessions: true,
              appleAuthorizations: true,
              activePushEndpoints: true,
            },
          })
        expect(firstEvent).toEqual({
          userId: subjectUserId,
          operatorUserId,
          activeSessions: 1,
          appleAuthorizations: 0,
          activePushEndpoints: 0,
        })
        expect(await revokeAccountPrivacyAccess(prisma, command)).toMatchObject(
          {
            replay: true,
            recovered: false,
          },
        )

        await prisma.session.create({
          data: {
            userId: subjectUserId,
            token: `privacy-recovery-${fixtureId}-2`,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        })
        await prisma.account.create({
          data: {
            accountId: `privacy-recovery-google-${fixtureId}`,
            providerId: "google",
            provider: "google",
            providerAccountId: `privacy-recovery-google-${fixtureId}`,
            userId: subjectUserId,
            idToken: "fixture-google-identity-token",
          },
        })
        const stageBeforeFailedAudit =
          await prisma.accountPrivacyAccessRevocation.findUniqueOrThrow({
            where: { requestId },
            select: { status: true, attempts: true },
          })
        const failingAuditDb = new Proxy(prisma, {
          get(target, property) {
            if (property !== "$transaction")
              return Reflect.get(target, property)
            return (
              operation: (tx: unknown) => Promise<unknown>,
              options: unknown,
            ) =>
              target.$transaction(
                (tx) =>
                  operation(
                    new Proxy(tx, {
                      get(transaction, delegateName) {
                        if (
                          delegateName !== "accountPrivacyAccessRecoveryEvent"
                        )
                          return Reflect.get(transaction, delegateName)
                        return new Proxy(
                          transaction.accountPrivacyAccessRecoveryEvent,
                          {
                            get(delegate, methodName) {
                              if (methodName === "create")
                                return async () => {
                                  throw new Error(
                                    "Injected recovery audit failure",
                                  )
                                }
                              return Reflect.get(delegate, methodName)
                            },
                          },
                        )
                      },
                    }),
                  ),
                options as never,
              )
          },
        }) as PrismaClient
        await expect(
          revokeAccountPrivacyAccess(failingAuditDb, command),
        ).rejects.toThrow("Injected recovery audit failure")
        expect(
          await prisma.accountPrivacyAccessRevocation.findUniqueOrThrow({
            where: { requestId },
            select: { status: true, attempts: true },
          }),
        ).toEqual(stageBeforeFailedAudit)
        expect(
          await prisma.accountPrivacyAccessRecoveryEvent.count({
            where: { requestId },
          }),
        ).toBe(1)
        expect(
          await prisma.session.count({ where: { userId: subjectUserId } }),
        ).toBe(1)
        const competing = await Promise.allSettled([
          revokeAccountPrivacyAccess(prisma, command),
          revokeAccountPrivacyAccess(prisma, command),
        ])
        expect(
          competing.some(
            (result) =>
              result.status === "fulfilled" && result.value.recovered === true,
          ),
        ).toBe(true)
        expect(
          await prisma.accountPrivacyAccessRecoveryEvent.count({
            where: { requestId },
          }),
        ).toBe(2)
        expect(
          await prisma.session.count({
            where: { userId: subjectUserId, expiresAt: { gt: new Date() } },
          }),
        ).toBe(0)
        expect(
          await prisma.account.count({
            where: { userId: subjectUserId, idToken: { not: null } },
          }),
        ).toBe(0)
        expect(
          await prisma.accountPrivacyDomainOutcome.count({
            where: { requestId, domain: "IDENTITY_ACCESS" },
          }),
        ).toBe(0)
        expect(
          await prisma.accountPrivacyRequest.findUnique({
            where: { id: requestId },
            select: { status: true },
          }),
        ).toEqual({ status: "PROCESSING" })
        await prisma.account.updateMany({
          where: { userId: subjectUserId, providerId: "google" },
          data: { accessToken: "fixture-google-access-token" },
        })
        await expect(
          revokeAccountPrivacyAccess(prisma, command),
        ).rejects.toMatchObject({ code: "GOOGLE_REVOKE_FAILED" })
        expect(
          await prisma.accountPrivacyAccessRevocation.findUniqueOrThrow({
            where: { requestId },
            select: { status: true },
          }),
        ).toEqual({ status: "FAILED" })
        expect(
          await prisma.accountPrivacyAccessRecoveryEvent.count({
            where: { requestId, otherProviderTokens: 1 },
          }),
        ).toBe(1)
        expect(
          await prisma.account.count({
            where: {
              userId: subjectUserId,
              accessToken: "fixture-google-access-token",
            },
          }),
        ).toBe(1)
        await prisma.account.create({
          data: {
            accountId: `privacy-recovery-apple-${fixtureId}`,
            providerId: "apple",
            provider: "apple",
            providerAccountId: `privacy-recovery-apple-${fixtureId}`,
            userId: subjectUserId,
            accessToken: "fixture-apple-access-token",
            scope: "com.ewatrade.app",
          },
        })
        const googleRevocations: string[] = []
        const appleRevocations: string[] = []
        expect(
          await revokeAccountPrivacyAccess(prisma, {
            ...command,
            revokeAppleAccess: async (token, clientId) => {
              appleRevocations.push(`${token}:${clientId}`)
            },
            revokeGoogle: async (token) => {
              googleRevocations.push(token)
            },
          }),
        ).toMatchObject({ accessRevoked: true, replay: false })
        expect(googleRevocations).toEqual(["fixture-google-access-token"])
        expect(appleRevocations).toEqual([
          "fixture-apple-access-token:com.ewatrade.app",
        ])
        expect(
          await prisma.account.count({
            where: {
              userId: subjectUserId,
              OR: [
                { accessToken: { not: null } },
                { refreshToken: { not: null } },
              ],
            },
          }),
        ).toBe(0)
      } finally {
        process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = previousFlag
        try {
          if (fixtureCreated) {
            await prisma.verification.deleteMany({
              where: { identifier: { in: mobileOtpIdentifiers } },
            })
            await prisma.accountPrivacyAccessRecoveryEvent.deleteMany({
              where: { requestId },
            })
            await prisma.accountPrivacyAccessRevocation.deleteMany({
              where: { requestId },
            })
            await prisma.accountPrivacyRequest.deleteMany({
              where: { id: requestId },
            })
            await prisma.user.deleteMany({
              where: { id: { in: [operatorUserId, subjectUserId] } },
            })
            expect(
              await prisma.accountPrivacyAccessRecoveryEvent.count({
                where: { requestId },
              }),
            ).toBe(0)
            expect(
              await prisma.user.count({
                where: { id: { in: [operatorUserId, subjectUserId] } },
              }),
            ).toBe(0)
          }
        } finally {
          await prisma.$disconnect()
        }
      }
    })
  },
)
