import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { submitExternalDeletionRequest } from "./account-privacy"
import { assessAccountPrivacyCompletion } from "./account-privacy-completion"
import { processAccountPrivacyProfile } from "./account-privacy-profile"
import { getAccountPrivacyProfileInventory } from "./account-privacy-profile-inventory"
import { accountPrivacyPseudonymousEmail } from "./account-privacy-profile-policy"
import { buildMobileOtpIdentifier } from "./mobile-otp-identifier"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
const describeDatabase = enabled ? describe : describe.skip

describeDatabase(
  "profile minimization on disposable guarded Neon records",
  () => {
    test.each(["RETAIN", "ERASE"] as const)(
      "executes %s receipt policy without touching another account",
      async (disposition) => {
        assertQaAccessAcceptanceDatabase()
        const { prisma } = await import("../client")
        const [schema] = await prisma.$queryRaw<
          Array<Record<string, string | null>>
        >`
          SELECT to_regclass('public."AssistantConversation"')::text AS assistant_conversation,
            to_regclass('public."AssistantRun"')::text AS assistant_run,
            to_regclass('public."Message"')::text AS message,
            to_regclass('public."AutomationEvent"')::text AS automation_event,
            to_regclass('public."ProductAnalyticsEvent"')::text AS product_analytics_event
        `
        if (!schema || Object.values(schema).some((table) => !table))
          throw new Error(
            "Development schema must include every additional-inventory table before fixture writes.",
          )
        const ids = {
          subject: randomUUID(),
          operator: randomUUID(),
          other: randomUUID(),
          request: randomUUID(),
          analytics: randomUUID(),
        }
        const email = `privacy-profile-${ids.subject}@example.test`
        const otherEmail = `privacy-profile-other-${ids.other}@example.test`
        const verifiedAt = new Date()
        const envKeys = [
          "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
          "ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED",
          "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
          "ACCOUNT_PRIVACY_PROFILE_POLICY_JSON",
          "ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256",
          "ACCOUNT_PRIVACY_OTP_SECRET",
        ]
        const previous = Object.fromEntries(
          envKeys.map((key) => [key, process.env[key]]),
        )
        const otpIds = [randomUUID(), randomUUID(), randomUUID()]
        const privacySecret = `qa-only-profile-retry-${randomUUID()}`
        const emailDigest = createHmac("sha256", privacySecret)
          .update(`account-deletion-email:${email}`)
          .digest("hex")
        try {
          await prisma.user.createMany({
            data: [
              {
                id: ids.operator,
                email: `privacy-profile-operator-${ids.operator}@example.test`,
                name: "QA operator",
                emailVerified: true,
                isPlatformAdmin: true,
              },
              {
                id: ids.subject,
                email,
                emailVerified: true,
                name: "QA profile",
                phone: `qa-${ids.subject}`,
                image: "qa-private-avatar",
                metadata: { fixture: ids.subject },
                ageBand: "AGE_13_TO_15",
                ageDeclaredAt: verifiedAt,
              },
              {
                id: ids.other,
                email: otherEmail,
                emailVerified: true,
                name: "QA unrelated account",
                ageBand: "ADULT",
                ageDeclaredAt: verifiedAt,
              },
            ],
          })
          await prisma.account.createMany({
            data: [
              {
                userId: ids.subject,
                providerId: "credential",
                accountId: ids.subject,
                password: "qa-only-unused-password-hash",
              },
              {
                userId: ids.other,
                providerId: "credential",
                accountId: ids.other,
                password: "qa-only-unrelated-hash",
              },
            ],
          })
          await prisma.legalAcceptance.createMany({
            data: [
              {
                userId: ids.subject,
                version: "qa-profile-v1",
                documentHash: "a".repeat(64),
                surface: "mobile",
              },
              {
                userId: ids.subject,
                version: "qa-profile-v2",
                documentHash: "b".repeat(64),
                surface: "web",
              },
            ],
          })
          await prisma.verification.createMany({
            data: [
              {
                id: otpIds[0],
                identifier: buildMobileOtpIdentifier({ email, mode: "login" }),
                value: "qa-only-expired-hash",
                expiresAt: new Date(verifiedAt.getTime() - 60_000),
              },
              {
                id: otpIds[1],
                identifier: buildMobileOtpIdentifier({
                  email,
                  mode: "sign_up",
                }),
                value: "qa-only-expired-hash",
                expiresAt: new Date(verifiedAt.getTime() - 60_000),
              },
              {
                id: otpIds[2],
                identifier: buildMobileOtpIdentifier({
                  email: otherEmail,
                  mode: "login",
                }),
                value: "qa-only-unrelated-hash",
                expiresAt: new Date(verifiedAt.getTime() + 60_000),
              },
            ],
          })
          await prisma.accountPrivacyRequest.create({
            data: {
              id: ids.request,
              requestKey: `account-deletion:${ids.subject}`,
              userId: ids.subject,
              verifiedSubjectUserId: ids.subject,
              verifiedAt,
              contactEmail: email,
              status: "PROCESSING",
              accessRevocation: {
                create: {
                  userId: ids.subject,
                  reviewedByUserId: ids.operator,
                  reviewedAt: verifiedAt,
                  completedAt: verifiedAt,
                  status: "REVOKED",
                },
              },
            },
          })
          // Fixture prerequisite rows isolate this processor. They are not proof of
          // other domain operations, processor reconciliation or end-to-end deletion.
          const domains = [
            "IDENTITY_ACCESS",
            "MEMBERSHIP",
            "CONVERSATIONS",
            "PRESCRIPTIONS",
            "COMMERCIAL_RECORDS",
            "SOFTWARE_SUBSCRIPTIONS",
            "EXTERNAL_PROCESSORS",
          ] as const
          await prisma.accountPrivacyDomainOutcome.createMany({
            data: domains.map((domain) => ({
              requestId: ids.request,
              userId: ids.subject,
              domain,
              disposition:
                domain === "IDENTITY_ACCESS" || domain === "MEMBERSHIP"
                  ? "ACCESS_REVOKED"
                  : "NOT_APPLICABLE",
              processor: "qa-profile-prerequisite-fixture-only",
              policyVersion: "qa-profile-policy-v1",
              evidenceDigest: "a".repeat(64),
              processedAt: new Date(),
            })),
          })
          const policy = JSON.stringify({
            version: "qa-profile-policy-v1",
            approvalReference:
              "disposable-fixture-only-not-production-approval",
            approvedAt: verifiedAt.toISOString(),
            mode: "PSEUDONYMIZE",
            legalAcceptanceDisposition: disposition,
            retentionPurpose: "QA-only fixture linkage",
            reviewAt: new Date(verifiedAt.getTime() + 86_400_000).toISOString(),
          })
          process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
          process.env.ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED = "true"
          process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION =
            "qa-profile-policy-v1"
          process.env.ACCOUNT_PRIVACY_PROFILE_POLICY_JSON = policy
          process.env.ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256 =
            createHash("sha256").update(policy).digest("hex")
          const command = {
            requestId: ids.request,
            operatorUserId: ids.operator,
          }
          // Future availability prevents a shared worker from dispatching this
          // deliberately synthetic, unhandled analytics fixture.
          await prisma.productAnalyticsEvent.create({
            data: {
              id: ids.analytics,
              userId: ids.subject,
              envelope: { syntheticFixtureOnly: true },
              availableAt: new Date(Date.now() + 86_400_000),
              expiresAt: new Date(Date.now() + 86_400_000),
            },
          })
          await expect(
            processAccountPrivacyProfile(prisma, command),
          ).rejects.toMatchObject({ code: "NOT_READY" })
          expect(
            await prisma.user.findUnique({
              where: { id: ids.subject },
              select: { email: true },
            }),
          ).toEqual({ email })
          await prisma.productAnalyticsEvent.deleteMany({
            where: { id: ids.analytics, userId: ids.subject },
          })
          expect(
            (await processAccountPrivacyProfile(prisma, command)).replay,
          ).toBe(false)
          expect(
            await getAccountPrivacyProfileInventory(prisma, ids.subject, email),
          ).toEqual({
            userExists: true,
            originalEmailRemains: false,
            personalFieldCount: 0,
            authAccounts: 0,
            sessions: 0,
            verificationRows: 0,
            legalAcceptances: disposition === "RETAIN" ? 2 : 0,
          })
          expect(
            await prisma.user.findUnique({
              where: { id: ids.subject },
              select: {
                email: true,
                emailVerified: true,
                ageBand: true,
                ageDeclaredAt: true,
              },
            }),
          ).toEqual({
            email: accountPrivacyPseudonymousEmail(ids.request, ids.subject),
            emailVerified: false,
            ageBand: "UNDECLARED",
            ageDeclaredAt: null,
          })
          expect(
            (await processAccountPrivacyProfile(prisma, command)).replay,
          ).toBe(true)
          const assessment = await assessAccountPrivacyCompletion(
            prisma,
            ids.request,
            { approvedPolicyVersion: "qa-profile-policy-v1" },
          )
          expect(assessment.blockers).toEqual([])
          expect(assessment.missingDomains).toEqual(["OUTCOME_NOTICE"])
          expect(assessment.eligible).toBe(false)
          // Seed only this fixture's fresh verified-email challenge. No email,
          // rate bucket, real user or shared verification record is created.
          const code = "123456"
          process.env.ACCOUNT_PRIVACY_OTP_SECRET = privacySecret
          await prisma.accountPrivacyChallenge.create({
            data: {
              emailDigest,
              contactEmail: email,
              codeDigest: createHmac("sha256", privacySecret)
                .update(`account-deletion-code:${emailDigest}:${code}`)
                .digest("hex"),
              expiresAt: new Date(Date.now() + 60_000),
              sentAt: new Date(),
              windowStartedAt: new Date(),
            },
          })
          expect(
            await submitExternalDeletionRequest(prisma, email, code),
          ).toMatchObject({ id: ids.request, status: "PROCESSING" })
          expect(
            await prisma.accountPrivacyRequest.count({
              where: { contactEmail: email },
            }),
          ).toBe(1)
          expect(
            await prisma.accountPrivacyChallenge.count({
              where: { emailDigest },
            }),
          ).toBe(0)
          expect(
            await prisma.account.count({ where: { userId: ids.other } }),
          ).toBe(1)
          expect(
            await prisma.verification.count({ where: { id: otpIds[2] } }),
          ).toBe(1)
          expect(
            await prisma.user.findUnique({
              where: { id: ids.other },
              select: { email: true, name: true, ageBand: true },
            }),
          ).toEqual({
            email: otherEmail,
            name: "QA unrelated account",
            ageBand: "ADULT",
          })
        } finally {
          for (const key of envKeys) {
            if (previous[key] === undefined)
              Reflect.deleteProperty(process.env, key)
            else process.env[key] = previous[key]
          }
          await prisma.accountPrivacyChallenge.deleteMany({
            where: { emailDigest },
          })
          await prisma.productAnalyticsEvent.deleteMany({
            where: { id: ids.analytics, userId: ids.subject },
          })
          await prisma.accountPrivacyDomainOutcome.deleteMany({
            where: { requestId: ids.request },
          })
          await prisma.accountPrivacyAccessRevocation.deleteMany({
            where: { requestId: ids.request },
          })
          await prisma.accountPrivacyRequest.deleteMany({
            where: { id: ids.request },
          })
          await prisma.verification.deleteMany({
            where: { id: { in: otpIds } },
          })
          await prisma.user.deleteMany({
            where: { id: { in: [ids.subject, ids.operator, ids.other] } },
          })
          expect(
            await prisma.user.count({
              where: { id: { in: [ids.subject, ids.operator, ids.other] } },
            }),
          ).toBe(0)
        }
      },
    )
  },
)
