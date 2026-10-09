import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { accountPrivacyPseudonymousEmail } from "./account-privacy-profile-policy"
import {
  listAccountPrivacyRetentionReviews,
  processAccountPrivacyRetention,
  reviewAccountPrivacyRetention,
} from "./account-privacy-retention"
import { accountPrivacyRetentionDeadlines } from "./account-privacy-retention-policy"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(300_000)
const describeWithDatabase = enabled ? describe : describe.skip

describeWithDatabase("guarded deletion retention lifecycle", () => {
  test("clears contact at 90 days, reviews at 12 months, expires scoped evidence at 24 months", async () => {
    assertQaAccessAcceptanceDatabase()
    const { prisma } = await import("../client")
    const tables = await prisma.$queryRaw<
      Array<{ present: string | null }>
    >`SELECT to_regclass('public."AccountPrivacyRetention"')::text AS present`
    if (!tables[0]?.present)
      throw new Error("Retention schema must exist before fixture writes")
    const requestId = randomUUID()
    const subjectId = randomUUID()
    const operatorId = randomUUID()
    const completedAt = new Date("2024-02-29T12:00:00.000Z")
    const deadlines = accountPrivacyRetentionDeadlines(completedAt)
    const policyVersion = `qa-retention-${requestId}`
    const source = JSON.stringify({
      version: policyVersion,
      approvalReference: "disposable-retention-fixture-only",
    })
    const digest = createHash("sha256").update(source).digest("hex")
    const config = {
      ACCOUNT_PRIVACY_PROCESSING_ENABLED: "true",
      ACCOUNT_PRIVACY_RETENTION_PROCESSING_ENABLED: "true",
      ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: policyVersion,
      ACCOUNT_PRIVACY_RETENTION_POLICY_JSON: source,
      ACCOUNT_PRIVACY_APPROVED_RETENTION_POLICY_SHA256: digest,
    }
    const previous = Object.fromEntries(
      Object.keys(config).map((key) => [key, process.env[key]]),
    )
    try {
      Object.assign(process.env, config)
      await prisma.user.createMany({
        data: [
          {
            id: subjectId,
            name: "",
            email: accountPrivacyPseudonymousEmail(requestId, subjectId),
            emailVerified: false,
          },
          {
            id: operatorId,
            name: "Retention QA Operator",
            email: `retention-operator-${operatorId}@example.test`,
            isPlatformAdmin: true,
          },
        ],
      })
      await prisma.accountPrivacyRequest.create({
        data: {
          id: requestId,
          userId: subjectId,
          verifiedSubjectUserId: subjectId,
          requestKey: `account-deletion:${subjectId}`,
          contactEmail: `retention-contact-${subjectId}@example.test`,
          status: "COMPLETED",
          verifiedAt: completedAt,
          completedAt,
          outcome: { fixture: true },
          retention: {
            create: {
              subjectUserId: subjectId,
              policyVersion,
              policyDigest: digest,
              completedAt,
              ...deadlines,
            },
          },
          domainOutcomes: {
            create: {
              userId: subjectId,
              domain: "ACCOUNT_PROFILE",
              disposition: "RETENTION_APPROVED",
              processor: "qa-retention-fixture",
              policyVersion,
              evidenceDigest: "a".repeat(64),
              processedAt: completedAt,
            },
          },
          noticeAttempts: {
            create: {
              userId: subjectId,
              attemptNumber: 1,
              status: "DELIVERED",
              policyVersion,
              contentDigest: "b".repeat(64),
              recipientDigest: "c".repeat(64),
              idempotencyKey: `qa-retention-${requestId}`,
              providerMessageId: `qa-message-${requestId}`,
              providerEventId: `qa-event-${requestId}`,
              sentAt: completedAt,
              deliveredAt: completedAt,
            },
          },
        },
      })
      await prisma.legalAcceptance.createMany({
        data: [
          {
            userId: subjectId,
            version: "old-qa-receipt",
            documentHash: "qa",
            surface: "qa",
            acceptedAt: completedAt,
          },
          {
            userId: subjectId,
            version: "later-qa-receipt",
            documentHash: "qa",
            surface: "qa",
            acceptedAt: new Date(completedAt.getTime() + 1),
          },
        ],
      })
      expect(
        (
          await processAccountPrivacyRetention(prisma, {
            requestId,
            now: new Date(deadlines.contactExpiresAt.getTime() - 1),
          })
        ).contactCleared,
      ).toBe(false)
      expect(
        (
          await processAccountPrivacyRetention(prisma, {
            requestId,
            now: deadlines.contactExpiresAt,
          })
        ).contactCleared,
      ).toBe(true)
      const cleared = await prisma.accountPrivacyRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: {
          contactEmail: true,
          outcome: true,
          noticeAttempts: {
            select: {
              recipientDigest: true,
              providerMessageId: true,
              providerEventId: true,
            },
          },
        },
      })
      expect(cleared.contactEmail).toBeNull()
      expect(cleared.outcome).toBeNull()
      expect(cleared.noticeAttempts[0]).toEqual({
        recipientDigest: "contact-expired",
        providerMessageId: null,
        providerEventId: null,
      })
      expect(
        (
          await processAccountPrivacyRetention(prisma, {
            requestId,
            now: deadlines.contactExpiresAt,
          })
        ).contactCleared,
      ).toBe(false)
      expect(
        (
          await listAccountPrivacyRetentionReviews(
            prisma,
            deadlines.reviewDueAt,
          )
        ).some((row) => row.requestId === requestId),
      ).toBe(true)
      await reviewAccountPrivacyRetention(prisma, {
        requestId,
        operatorUserId: operatorId,
        now: deadlines.reviewDueAt,
        hold: null,
      })
      expect(
        (
          await listAccountPrivacyRetentionReviews(
            prisma,
            deadlines.reviewDueAt,
          )
        ).some((row) => row.requestId === requestId),
      ).toBe(false)
      const holdReviewAt = new Date(
        deadlines.evidenceExpiresAt.getTime() + 86_400_000,
      )
      await reviewAccountPrivacyRetention(prisma, {
        requestId,
        operatorUserId: operatorId,
        now: deadlines.evidenceExpiresAt,
        hold: { reason: "QA bounded hold", reviewAt: holdReviewAt },
      })
      expect(
        (
          await processAccountPrivacyRetention(prisma, {
            requestId,
            now: deadlines.evidenceExpiresAt,
          })
        ).held,
      ).toBe(true)
      expect(
        (
          await processAccountPrivacyRetention(prisma, {
            requestId,
            now: holdReviewAt,
          })
        ).evidenceExpired,
      ).toBe(true)
      expect(
        await prisma.accountPrivacyRequest.count({ where: { id: requestId } }),
      ).toBe(0)
      expect(
        await prisma.accountPrivacyRetention.count({ where: { requestId } }),
      ).toBe(0)
      expect(
        await prisma.accountPrivacyDomainOutcome.count({
          where: { requestId },
        }),
      ).toBe(0)
      expect(
        await prisma.accountPrivacyNoticeAttempt.count({
          where: { requestId },
        }),
      ).toBe(0)
      expect(
        await prisma.legalAcceptance.count({
          where: { userId: subjectId, version: "old-qa-receipt" },
        }),
      ).toBe(0)
      expect(
        await prisma.legalAcceptance.count({
          where: { userId: subjectId, version: "later-qa-receipt" },
        }),
      ).toBe(1)
      expect(await prisma.user.count({ where: { id: subjectId } })).toBe(1)
      expect(
        (
          await processAccountPrivacyRetention(prisma, {
            requestId,
            now: holdReviewAt,
          })
        ).evidenceExpired,
      ).toBe(false)
    } finally {
      await prisma.accountPrivacyNoticeAttempt.deleteMany({
        where: { requestId },
      })
      await prisma.accountPrivacyDomainOutcome.deleteMany({
        where: { requestId },
      })
      await prisma.accountPrivacyRequest.deleteMany({
        where: { id: requestId },
      })
      await prisma.user.deleteMany({
        where: { id: { in: [subjectId, operatorId] } },
      })
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) Reflect.deleteProperty(process.env, key)
        else process.env[key] = value
      }
      expect(
        await prisma.user.count({
          where: { id: { in: [subjectId, operatorId] } },
        }),
      ).toBe(0)
    }
  })
})
