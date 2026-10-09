import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { getAccountPrivacyReview } from "./account-privacy"
import {
  ACCOUNT_PRIVACY_REQUIRED_DOMAINS,
  assessAccountPrivacyCompletion,
  completeAccountPrivacyRequest,
} from "./account-privacy-completion"
import {
  accountPrivacyRecipientDigest,
  recordAccountPrivacyNoticeDelivery,
  recordAccountPrivacyNoticeFailure,
} from "./account-privacy-notice"
import { getAccountPrivacyNoticeAlertSummary } from "./account-privacy-notice-alert"
import {
  bindAccountPrivacyNoticeProviderEvent,
  claimAccountPrivacyNoticeSend,
  markAccountPrivacyNoticeSendUncertain,
  prepareAccountPrivacyNotice,
  recordAccountPrivacyNoticeSendReceipt,
} from "./account-privacy-notice-preparation"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(300_000)
const describeWithDatabase = enabled ? describe : describe.skip

describeWithDatabase(
  "account privacy completion on guarded Neon fixture",
  () => {
    test("requires every outcome and refuses an email invite after User deletion", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const alertBaseline = await getAccountPrivacyNoticeAlertSummary(
        prisma,
        new Date(),
      )
      const fixtureId = randomUUID()
      const operatorUserId = randomUUID()
      const subjectUserId = randomUUID()
      const otherUserId = randomUUID()
      const tenantId = randomUUID()
      const planId = randomUUID()
      const requestId = randomUUID()
      const now = new Date()
      const policyVersion = "fixture-approved-policy-v1"
      const previous = {
        processing: process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED,
        completion: process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED,
        policy: process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION,
        retentionPolicy: process.env.ACCOUNT_PRIVACY_RETENTION_POLICY_JSON,
        retentionDigest:
          process.env.ACCOUNT_PRIVACY_APPROVED_RETENTION_POLICY_SHA256,
        noticeSending: process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED,
        noticeDigest:
          process.env.ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST,
        recipientHmacKey: process.env.ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY,
      }
      let usersCreated = false
      try {
        await prisma.user.createMany({
          data: [
            {
              id: operatorUserId,
              email: `privacy-completion-operator-${fixtureId}@example.test`,
              emailVerified: true,
              isPlatformAdmin: true,
              name: "Privacy Completion QA Operator",
            },
            {
              id: subjectUserId,
              email: `privacy-completion-subject-${fixtureId}@example.test`,
              emailVerified: true,
              name: "Privacy Completion QA Subject",
            },
            {
              id: otherUserId,
              email: `privacy-completion-other-${fixtureId}@example.test`,
              emailVerified: true,
              name: "Privacy Completion QA Other User",
            },
          ],
        })
        usersCreated = true
        await prisma.tenant.create({
          data: {
            id: tenantId,
            slug: `privacy-completion-${fixtureId}`,
            name: "Privacy Completion QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "privacy-completion.test",
            qaMarkedAt: now,
          },
        })
        await prisma.subscriptionPlan.create({
          data: {
            id: planId,
            key: `privacy-completion-${fixtureId}`,
            name: "Privacy Completion QA Plan",
            limits: {},
          },
        })
        await prisma.billingCheckoutSession.create({
          data: {
            tenantId,
            planId,
            requestedByUserId: subjectUserId,
          },
        })
        await prisma.retailOpsStaffInviteToken.create({
          data: {
            tenantId,
            invitedUserId: otherUserId,
            email: `privacy-completion-subject-${fixtureId}@example.test`,
            role: "OWNER",
            tokenHash: `claimed-by-other-${fixtureId}`,
            invitedByUserId: operatorUserId,
            expiresAt: new Date(now.getTime() + 86_400_000),
          },
        })
        await prisma.accountPrivacyRequest.create({
          data: {
            id: requestId,
            requestKey: `account-deletion:${subjectUserId}`,
            userId: subjectUserId,
            verifiedSubjectUserId: subjectUserId,
            contactEmail: `privacy-completion-subject-${fixtureId}@example.test`,
            verifiedAt: now,
            status: "PROCESSING",
            accessRevocation: {
              create: {
                userId: subjectUserId,
                reviewedByUserId: operatorUserId,
                reviewedAt: now,
                status: "REVOKED",
                completedAt: now,
              },
            },
          },
        })
        const outcomes = ACCOUNT_PRIVACY_REQUIRED_DOMAINS.map((domain) => ({
          requestId,
          userId: subjectUserId,
          domain,
          disposition:
            domain === "IDENTITY_ACCESS" || domain === "MEMBERSHIP"
              ? ("ACCESS_REVOKED" as const)
              : domain === "ACCOUNT_PROFILE"
                ? ("ERASURE_CONFIRMED" as const)
                : domain === "OUTCOME_NOTICE"
                  ? ("NOTICE_DELIVERED" as const)
                  : ("NOT_APPLICABLE" as const),
          processor: `fixture:${domain.toLowerCase()}:v1`,
          policyVersion,
          evidenceDigest: "a".repeat(64),
        }))
        await prisma.accountPrivacyDomainOutcome.createMany({
          data: outcomes.filter(
            (outcome) => outcome.domain !== "OUTCOME_NOTICE",
          ),
        })
        process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = policyVersion
        const retentionSource = JSON.stringify({
          version: policyVersion,
          approvalReference: "disposable-completion-fixture",
        })
        process.env.ACCOUNT_PRIVACY_RETENTION_POLICY_JSON = retentionSource
        process.env.ACCOUNT_PRIVACY_APPROVED_RETENTION_POLICY_SHA256 =
          createHash("sha256").update(retentionSource).digest("hex")
        const command = { requestId, operatorUserId, now }
        await expect(
          completeAccountPrivacyRequest(prisma, command),
        ).rejects.toMatchObject({ code: "NOT_READY" })
        expect(
          await prisma.accountPrivacyRequest.findUnique({
            where: { id: requestId },
            select: { status: true, completedAt: true },
          }),
        ).toEqual({ status: "PROCESSING", completedAt: null })
        const notice = outcomes.find(
          (outcome) => outcome.domain === "OUTCOME_NOTICE",
        )
        if (!notice) throw new Error("Fixture notice is missing")
        await prisma.accountPrivacyDomainOutcome.create({ data: notice })
        const beforeErasure = await assessAccountPrivacyCompletion(
          prisma,
          requestId,
          { approvedPolicyVersion: policyVersion, now: new Date() },
        )
        expect(beforeErasure.blockers).toContain(
          "ACCOUNT_PROFILE_ERASURE_UNCONFIRMED",
        )
        expect(beforeErasure.blockers).toContain("NOTICE_DELIVERY_UNCONFIRMED")
        await prisma.accountPrivacyDomainOutcome.update({
          where: { requestId_domain: { requestId, domain: "ACCOUNT_PROFILE" } },
          data: { disposition: "ANONYMIZATION_CONFIRMED" },
        })
        const beforeAnonymization = await assessAccountPrivacyCompletion(
          prisma,
          requestId,
          { approvedPolicyVersion: policyVersion, now: new Date() },
        )
        expect(beforeAnonymization.blockers).toContain(
          "ACCOUNT_PROFILE_ANONYMIZATION_UNCONFIRMED",
        )
        const linkedAccountId = randomUUID()
        await prisma.account.create({
          data: {
            id: linkedAccountId,
            userId: subjectUserId,
            providerId: "credential",
            accountId: `privacy-completion-${fixtureId}`,
            passwordHash: "fixture-password-hash",
          },
        })
        const withLinkedAuthAccount = await assessAccountPrivacyCompletion(
          prisma,
          requestId,
          { approvedPolicyVersion: policyVersion, now: new Date() },
        )
        expect(withLinkedAuthAccount.blockers).toContain(
          "ACCOUNT_PROFILE_AUTH_ACCOUNT_REMAINS",
        )
        await prisma.account.delete({ where: { id: linkedAccountId } })
        await prisma.accountPrivacyDomainOutcome.update({
          where: { requestId_domain: { requestId, domain: "ACCOUNT_PROFILE" } },
          data: { disposition: "ERASURE_CONFIRMED" },
        })
        const messageId = `fixture-receiver-message-${fixtureId}`
        const hmacKey = "fixture-receiver-key-of-at-least-32-bytes"
        await prisma.accountPrivacyNoticeAttempt.create({
          data: {
            requestId,
            userId: subjectUserId,
            attemptNumber: 1,
            status: "SENT",
            policyVersion,
            contentDigest: "a".repeat(64),
            recipientDigest: accountPrivacyRecipientDigest(
              `privacy-completion-subject-${fixtureId}@example.test`,
              hmacKey,
            ),
            idempotencyKey: `fixture-receiver-${fixtureId}`,
            providerMessageId: messageId,
            sentAt: now,
          },
        })
        const event = {
          eventId: `fixture-receiver-event-${fixtureId}`,
          messageId,
          recipient: `wrong-${fixtureId}@example.test`,
          occurredAt: new Date(),
        }
        const config = {
          policyVersion,
          recipientHmacKey: hmacKey,
          now: new Date(),
        }
        expect(
          await recordAccountPrivacyNoticeDelivery(prisma, event, config),
        ).toEqual({ recorded: false, reason: "MISMATCH" })
        expect(
          await recordAccountPrivacyNoticeDelivery(
            prisma,
            {
              ...event,
              recipient: `privacy-completion-subject-${fixtureId}@example.test`,
            },
            config,
          ),
        ).toEqual({ recorded: false, reason: "DOMAINS_NOT_READY" })
        expect(
          await prisma.accountPrivacyNoticeAttempt.findUnique({
            where: { providerMessageId: messageId },
            select: { status: true, providerEventId: true },
          }),
        ).toEqual({ status: "SENT", providerEventId: null })
        await prisma.accountPrivacyNoticeAttempt.delete({
          where: { providerMessageId: messageId },
        })
        await prisma.user.delete({ where: { id: subjectUserId } })
        const unclaimedInviteHash = `unclaimed-subject-${fixtureId}`
        await prisma.retailOpsStaffInviteToken.create({
          data: {
            tenantId,
            email: `privacy-completion-subject-${fixtureId}@example.test`,
            role: "MEMBER",
            tokenHash: unclaimedInviteHash,
            invitedByUserId: operatorUserId,
            expiresAt: new Date(now.getTime() + 86_400_000),
          },
        })
        command.now = new Date()
        await expect(
          completeAccountPrivacyRequest(prisma, command),
        ).rejects.toMatchObject({ code: "NOT_READY" })
        await prisma.retailOpsStaffInviteToken.update({
          where: { tokenHash: unclaimedInviteHash },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
            revokedByUserId: operatorUserId,
          },
        })
        command.now = new Date()
        await expect(
          completeAccountPrivacyRequest(prisma, command),
        ).rejects.toMatchObject({ code: "NOT_READY" })
        const subscriptionProcessedAt = new Date()
        await prisma.accountPrivacyDomainOutcome.update({
          where: {
            requestId_domain: {
              requestId,
              domain: "SOFTWARE_SUBSCRIPTIONS",
            },
          },
          data: {
            disposition: "RETENTION_APPROVED",
            nextReviewAt: new Date(
              subscriptionProcessedAt.getTime() + 30 * 86_400_000,
            ),
            processedAt: subscriptionProcessedAt,
          },
        })
        await prisma.accountPrivacyDomainOutcome.delete({
          where: { requestId_domain: { requestId, domain: "OUTCOME_NOTICE" } },
        })
        process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST = "a".repeat(
          64,
        )
        process.env.ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY = hmacKey
        const prepared = await prepareAccountPrivacyNotice(prisma, {
          requestId,
          operatorUserId,
          contentDigest: "a".repeat(64),
        })
        expect(prepared).toMatchObject({ replay: false })
        expect(
          await prepareAccountPrivacyNotice(prisma, {
            requestId,
            operatorUserId,
            contentDigest: "a".repeat(64),
          }),
        ).toEqual({ ...prepared, replay: true })
        expect(
          await prisma.accountPrivacyNoticeAttempt.count({
            where: { requestId },
          }),
        ).toBe(1)
        const sendClaim = await claimAccountPrivacyNoticeSend(prisma, {
          attemptId: prepared.attemptId,
          operatorUserId,
          contentDigest: "a".repeat(64),
        })
        expect(sendClaim).toMatchObject({
          attemptId: prepared.attemptId,
          idempotencyKey: prepared.idempotencyKey,
          recipient: `privacy-completion-subject-${fixtureId}@example.test`,
        })
        await expect(
          claimAccountPrivacyNoticeSend(prisma, {
            attemptId: prepared.attemptId,
            operatorUserId,
            contentDigest: "a".repeat(64),
          }),
        ).rejects.toMatchObject({ code: "CLAIM_CONFLICT" })
        expect(
          await markAccountPrivacyNoticeSendUncertain(
            prisma,
            prepared.attemptId,
          ),
        ).toEqual({ attemptId: prepared.attemptId, marked: true })
        const bindInput = {
          attemptId: prepared.attemptId,
          providerMessageId: `fixture-message-${fixtureId}`,
          recipient: sendClaim.recipient,
          providerCreatedAt: new Date(),
          occurredAt: new Date(),
          policyVersion,
          recipientHmacKey: hmacKey,
        }
        expect(
          await bindAccountPrivacyNoticeProviderEvent(prisma, {
            ...bindInput,
            recipient: `wrong-${fixtureId}@example.test`,
          }),
        ).toEqual({ bound: false, reason: "MISMATCH" })
        expect(
          await bindAccountPrivacyNoticeProviderEvent(prisma, bindInput),
        ).toEqual({ bound: true, replay: false })
        expect(
          await bindAccountPrivacyNoticeProviderEvent(prisma, bindInput),
        ).toEqual({ bound: true, replay: true })
        expect(
          await bindAccountPrivacyNoticeProviderEvent(prisma, {
            ...bindInput,
            providerMessageId: `other-message-${fixtureId}`,
          }),
        ).toEqual({ bound: false, reason: "MESSAGE_CONFLICT" })
        expect(
          await recordAccountPrivacyNoticeSendReceipt(prisma, {
            attemptId: prepared.attemptId,
            providerMessageId: bindInput.providerMessageId,
          }),
        ).toEqual({ attemptId: prepared.attemptId, status: "SENT" })
        const deliveredAt = new Date()
        await prisma.accountPrivacyNoticeAttempt.update({
          where: { id: prepared.attemptId },
          data: {
            status: "DELIVERED",
            providerEventId: `fixture-event-${fixtureId}`,
            deliveryEvidenceDigest: "a".repeat(64),
            deliveredAt,
          },
        })
        await prisma.accountPrivacyDomainOutcome.create({
          data: { ...notice, processedAt: new Date() },
        })
        const failure = {
          eventId: `fixture-failure-event-${fixtureId}`,
          messageId: `fixture-message-${fixtureId}`,
          recipient: `privacy-completion-subject-${fixtureId}@example.test`,
          occurredAt: new Date(),
          type: "email.bounced" as const,
        }
        expect(
          await recordAccountPrivacyNoticeFailure(prisma, failure, {
            policyVersion,
            recipientHmacKey: hmacKey,
            now: new Date(),
          }),
        ).toMatchObject({ recorded: true, replay: false })
        expect(
          await prisma.accountPrivacyNoticeAttempt.findUnique({
            where: { providerMessageId: failure.messageId },
            select: {
              status: true,
              providerEventId: true,
              failureEventId: true,
              deliveredAt: true,
              failedAt: true,
            },
          }),
        ).toMatchObject({
          status: "FAILED",
          providerEventId: `fixture-event-${fixtureId}`,
          failureEventId: failure.eventId,
          deliveredAt,
          failedAt: failure.occurredAt,
        })
        const review = await getAccountPrivacyReview(prisma, requestId)
        expect(review?.noticeAttempts[0]).toMatchObject({
          status: "FAILED",
          failureEventId: failure.eventId,
        })
        expect(
          await getAccountPrivacyNoticeAlertSummary(prisma, new Date()),
        ).toMatchObject({
          failed: alertBaseline.failed + 1,
          failedAfterCompletion: alertBaseline.failedAfterCompletion,
        })
        command.now = new Date()
        await expect(
          completeAccountPrivacyRequest(prisma, command),
        ).rejects.toMatchObject({ code: "NOT_READY" })
        await prisma.accountPrivacyNoticeAttempt.update({
          where: { providerMessageId: failure.messageId },
          data: {
            status: "DELIVERED",
            failureEventId: null,
            failureEvidenceDigest: null,
            failedAt: null,
          },
        })
        command.now = new Date()
        expect(await completeAccountPrivacyRequest(prisma, command)).toEqual({
          requestId,
          status: "COMPLETED",
          completedAt: command.now,
          replay: false,
        })
        expect(
          await completeAccountPrivacyRequest(prisma, command),
        ).toMatchObject({
          status: "COMPLETED",
          replay: true,
        })
        const postCompletionFailure = {
          ...failure,
          eventId: `fixture-post-completion-failure-${fixtureId}`,
          occurredAt: new Date(),
        }
        expect(
          await recordAccountPrivacyNoticeFailure(
            prisma,
            postCompletionFailure,
            { policyVersion, recipientHmacKey: hmacKey, now: new Date() },
          ),
        ).toMatchObject({ recorded: true, completedRequest: true })
        expect(
          await prisma.accountPrivacyRequest.findUnique({
            where: { id: requestId },
            select: { status: true, completedAt: true },
          }),
        ).toEqual({ status: "FAILED", completedAt: command.now })
        expect(
          await getAccountPrivacyNoticeAlertSummary(prisma, new Date()),
        ).toMatchObject({
          failed: alertBaseline.failed + 1,
          failedAfterCompletion: alertBaseline.failedAfterCompletion + 1,
        })
        await expect(
          completeAccountPrivacyRequest(prisma, command),
        ).rejects.toMatchObject({ code: "NOT_READY" })
        await prisma.retailOpsStaffInviteToken.update({
          where: { tokenHash: unclaimedInviteHash },
          data: { status: "ACTIVE", revokedAt: null, revokedByUserId: null },
        })
        await expect(
          completeAccountPrivacyRequest(prisma, command),
        ).rejects.toMatchObject({ code: "NOT_READY" })
      } finally {
        const restore = (name: string, value: string | undefined) => {
          if (value === undefined) Reflect.deleteProperty(process.env, name)
          else process.env[name] = value
        }
        restore("ACCOUNT_PRIVACY_PROCESSING_ENABLED", previous.processing)
        restore("ACCOUNT_PRIVACY_COMPLETION_ENABLED", previous.completion)
        restore("ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION", previous.policy)
        restore(
          "ACCOUNT_PRIVACY_RETENTION_POLICY_JSON",
          previous.retentionPolicy,
        )
        restore(
          "ACCOUNT_PRIVACY_APPROVED_RETENTION_POLICY_SHA256",
          previous.retentionDigest,
        )
        restore(
          "ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED",
          previous.noticeSending,
        )
        restore(
          "ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST",
          previous.noticeDigest,
        )
        restore(
          "ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY",
          previous.recipientHmacKey,
        )
        try {
          if (usersCreated) {
            await prisma.session.deleteMany({
              where: { userId: subjectUserId },
            })
            await prisma.accountPrivacyDomainOutcome.deleteMany({
              where: { requestId },
            })
            await prisma.accountPrivacyNoticeAttempt.deleteMany({
              where: { requestId },
            })
            await prisma.accountPrivacyAccessRevocation.deleteMany({
              where: { requestId },
            })
            await prisma.accountPrivacyRequest.deleteMany({
              where: { id: requestId },
            })
            await prisma.tenant.deleteMany({ where: { id: tenantId } })
            await prisma.subscriptionPlan.deleteMany({ where: { id: planId } })
            await prisma.user.deleteMany({
              where: {
                id: { in: [operatorUserId, subjectUserId, otherUserId] },
              },
            })
            expect(
              await prisma.accountPrivacyRequest.count({
                where: { id: requestId },
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
