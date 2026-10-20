import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import type { createOfficePrivacyQa } from "../../../../scripts/qa-oversight-office-fixture"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { requestAccountDeletion } from "./account-privacy"
import { isAccountPrivacyAccessBlocked } from "./account-privacy-access"
import { processAccountPrivacyActivity } from "./account-privacy-activity"
import { recordAccountPrivacyExternalReview } from "./account-privacy-external-review"
import { processAccountPrivacyPrivateAssistant } from "./account-privacy-private-assistant"
import { processAccountPrivacyProfile } from "./account-privacy-profile"
import {
  advanceAccountPrivacyWorkflow,
  getAccountPrivacyWorkflow,
} from "./account-privacy-workflow"
import { completeAssistantRun } from "./assistant"
import { pinAssistantAttachmentStorage } from "./assistant-attachments"
import {
  claimProductAnalyticsEvent,
  persistProductAnalyticsEvent,
  settleProductAnalyticsEvent,
} from "./product-analytics"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(360_000)
const databaseTests = enabled ? describe : describe.skip
const flags = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_IDENTITY_OUTCOME_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_PRESCRIPTION_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_COMMERCIAL_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_ACTIVITY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED",
]
const keys = [
  ...flags,
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
  "ACCOUNT_PRIVACY_ACTIVITY_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_ACTIVITY_POLICY_SHA256",
  "ACCOUNT_PRIVACY_EXTERNAL_REVIEW_ENABLED",
  "ACCOUNT_PRIVACY_EXTERNAL_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_EXTERNAL_POLICY_SHA256",
  "ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_PRIVATE_ASSISTANT_POLICY_SHA256",
  "ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_PROFILE_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256",
]
const providers = {
  revokeApple: async () => {
    throw Error("fixture must never call a provider")
  },
  revokeAppleAccess: async () => {
    throw Error("fixture must never call a provider")
  },
  revokeGoogle: async () => {
    throw Error("fixture must never call a provider")
  },
}

databaseTests(
  "canonical deletion workflow on disposable Development accounts",
  () => {
    test("revokes login, processes real empty domains and analytics, preserves another account, and refuses unproven provider completion", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const ids = {
        subject: randomUUID(),
        operator: randomUUID(),
        other: randomUUID(),
        event: randomUUID(),
        otherEvent: randomUUID(),
        suppressed: randomUUID(),
        tenant: randomUUID(),
        store: randomUUID(),
        conversation: randomUUID(),
        otherConversation: randomUUID(),
        attachment: randomUUID(),
        run: randomUUID(),
      }
      const email = `privacy-workflow-${ids.subject}@example.test`
      const previous = Object.fromEntries(
        keys.map((key) => [key, process.env[key]]),
      )
      let office: Awaited<ReturnType<typeof createOfficePrivacyQa>> | undefined
      let requestId: string | undefined
      try {
        await prisma.user.createMany({
          data: [
            {
              id: ids.subject,
              email,
              emailVerified: true,
              name: "Synthetic deletion subject",
            },
            {
              id: ids.operator,
              email: `privacy-workflow-operator-${ids.operator}@example.test`,
              emailVerified: true,
              name: "Synthetic deletion operator",
              isPlatformAdmin: true,
            },
            {
              id: ids.other,
              email: `privacy-workflow-other-${ids.other}@example.test`,
              emailVerified: true,
              name: "Unrelated synthetic account",
            },
          ],
        })
        await prisma.tenant.create({
          data: {
            id: ids.tenant,
            slug: `privacy-private-${ids.tenant}`,
            name: "Disposable privacy fixture",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaMarkedAt: new Date(),
            qaSourceDomain: "account-privacy-workflow.test",
          },
        })
        await prisma.store.create({
          data: {
            id: ids.store,
            tenantId: ids.tenant,
            slug: `privacy-private-${ids.store}`,
            name: "Disposable privacy store",
            status: "ACTIVE",
          },
        })
        await prisma.assistantConversation.createMany({
          data: [
            {
              id: ids.conversation,
              tenantId: ids.tenant,
              storeId: ids.store,
              ownerUserId: ids.subject,
              purpose: "GENERAL",
            },
            {
              id: ids.otherConversation,
              tenantId: ids.tenant,
              storeId: ids.store,
              ownerUserId: ids.other,
              purpose: "GENERAL",
            },
          ],
        })
        await prisma.assistantMessage.createMany({
          data: [
            {
              id: randomUUID(),
              conversationId: ids.conversation,
              sequence: 1,
              role: "user",
              parts: [{ type: "text", text: "Synthetic private subject text" }],
            },
            {
              id: randomUUID(),
              conversationId: ids.otherConversation,
              sequence: 1,
              role: "user",
              parts: [
                { type: "text", text: "Unrelated synthetic private text" },
              ],
            },
          ],
        })
        await prisma.assistantRun.create({
          data: {
            id: ids.run,
            conversationId: ids.conversation,
            actorUserId: ids.subject,
            requestId: randomUUID(),
            provider: "synthetic",
            model: "synthetic",
            promptVersion: "synthetic",
            status: "RUNNING",
          },
        })
        await prisma.assistantAttachment.create({
          data: {
            id: ids.attachment,
            conversationId: ids.conversation,
            tenantId: ids.tenant,
            storeId: ids.store,
            actorUserId: ids.subject,
            kind: "TEXT",
            status: "READY",
            fileName: "synthetic.txt",
            contentType: "text/plain",
            sizeBytes: 1,
            contentDigest: "a".repeat(64),
            storageProvider: "local_test",
            storageStoreId: "store_localtest",
            storagePath: `assistant/attachments/${ids.tenant}/${ids.conversation}/${ids.attachment}/${"a".repeat(64)}.txt`,
            uploadExpiresAt: new Date(Date.now() - 1000),
            retentionUntil: new Date(Date.now() + 86400000),
          },
        })
        await prisma.assistantUsageEvent.create({
          data: {
            actorUserId: ids.subject,
            tenantId: ids.tenant,
            provider: "synthetic",
            model: "synthetic",
            outcome: "success",
          },
        })
        await prisma.account.createMany({
          data: [ids.subject, ids.other].map((userId) => ({
            userId,
            providerId: "credential",
            accountId: userId,
            password: "synthetic-unused-hash",
          })),
        })
        await prisma.session.createMany({
          data: [ids.subject, ids.other].map((userId) => ({
            userId,
            token: `synthetic-privacy-${userId}`,
            expiresAt: new Date(Date.now() + 86400000),
          })),
        })
        await persistProductAnalyticsEvent(prisma, {
          id: ids.event,
          userId: ids.subject,
          envelope: { synthetic: true },
        })
        await persistProductAnalyticsEvent(prisma, {
          id: ids.otherEvent,
          userId: ids.other,
          envelope: { synthetic: true },
        })
        const claimed = await claimProductAnalyticsEvent(prisma, ids.event)
        expect(claimed?.leaseToken).toBeTruthy()
        if (!claimed?.leaseToken) throw Error("Fixture analytics claim missing")
        const request = await requestAccountDeletion(prisma, ids.subject, email)
        requestId = request.id
        const policy = JSON.stringify({
          version: "qa-workflow-v1",
          approvalReference: "isolated-synthetic-test-only",
          mode: "ERASE_PRODUCT_ANALYTICS",
          approvedAt: new Date(Date.now() - 60000).toISOString(),
          reviewAt: new Date(Date.now() + 86400000).toISOString(),
        })
        for (const flag of flags) process.env[flag] = "true"
        process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "qa-workflow-v1"
        process.env.ACCOUNT_PRIVACY_ACTIVITY_POLICY_JSON = policy
        process.env.ACCOUNT_PRIVACY_APPROVED_ACTIVITY_POLICY_SHA256 =
          createHash("sha256").update(policy).digest("hex")
        const privatePolicy = JSON.stringify({
          version: "qa-workflow-v1",
          approvalReference: "isolated-synthetic-test-only",
          mode: "ERASE_PRIVATE_ASSISTANT_DATA",
          approvedAt: new Date(Date.now() - 60000).toISOString(),
          reviewAt: new Date(Date.now() + 86400000).toISOString(),
        })
        process.env.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_POLICY_JSON =
          privatePolicy
        process.env.ACCOUNT_PRIVACY_APPROVED_PRIVATE_ASSISTANT_POLICY_SHA256 =
          createHash("sha256").update(privatePolicy).digest("hex")
        const input = { requestId, operatorUserId: ids.operator }
        if (process.env.OVERSIGHT_QA_REPOSITORY) {
          const officeFixturePath =
            "../../../../scripts/qa-oversight-office-fixture"
          const { createOfficePrivacyQa } = await import(officeFixturePath)
          office = await createOfficePrivacyQa(prisma, ids.operator, requestId)
        }
        const advanceTestWorkflow: typeof advanceAccountPrivacyWorkflow =
          async (db, input, providers) => {
            if (office) return await office.advance(input, providers)
            return advanceAccountPrivacyWorkflow(db, input, providers)
          }
        for (const expectedStep of [
          "BEGIN_REVIEW",
          "REVOKE_ACCESS",
          "REVOKE_MEMBERSHIPS",
          "CONFIRM_IDENTITY",
          "CONFIRM_CONVERSATIONS",
          "CONFIRM_PRESCRIPTIONS",
          "CONFIRM_COMMERCIAL_RECORDS",
          "CONFIRM_SUBSCRIPTIONS",
        ] as const) {
          if (expectedStep === "CONFIRM_CONVERSATIONS") {
            expect(
              (await getAccountPrivacyWorkflow(prisma, input)).nextStep,
            ).toBe("ERASE_PRIVATE_ASSISTANT")
            await expect(
              processAccountPrivacyPrivateAssistant(prisma, input, async () => {
                throw Error("provider must not be reached")
              }),
            ).rejects.toMatchObject({ code: "PRIVATE_WORK_UNRESOLVED" })
            await completeAssistantRun(prisma, {
              runId: ids.run,
              actorUserId: ids.subject,
              tenantId: ids.tenant,
              provider: "synthetic",
              model: "synthetic",
              status: "COMPLETED",
              assistantMessage: {
                id: randomUUID(),
                role: "assistant",
                parts: [
                  { type: "text", text: "Late content must not persist" },
                ],
              },
            })
            expect(
              await prisma.assistantRun.findUnique({
                where: { id: ids.run },
                select: { status: true, errorCode: true },
              }),
            ).toEqual({ status: "FAILED", errorCode: "ACCOUNT_DELETION" })
            expect(
              await prisma.assistantMessage.count({
                where: { conversationId: ids.conversation },
              }),
            ).toBe(1)
            expect(
              await prisma.assistantUsageEvent.count({
                where: { runId: ids.run },
              }),
            ).toBe(0)
            expect(
              await pinAssistantAttachmentStorage(
                prisma,
                {
                  userId: ids.subject,
                  tenantId: ids.tenant,
                  storeId: ids.store,
                },
                {
                  attachmentId: ids.attachment,
                  storageProvider: "local_test",
                  storageStoreId: "store_localtest",
                  storagePath: "wrong",
                },
              ),
            ).toBe(false)
            const original = await prisma.assistantAttachment.findUniqueOrThrow(
              {
                where: { id: ids.attachment },
                select: {
                  storageProvider: true,
                  storageStoreId: true,
                  storagePath: true,
                },
              },
            )
            await prisma.assistantAttachment.update({
              where: { id: ids.attachment },
              data: {
                storageProvider: null,
                storageStoreId: null,
                storagePath: null,
              },
            })
            await expect(
              processAccountPrivacyPrivateAssistant(prisma, input, async () => {
                throw Error("unknown ownership must not reach provider")
              }),
            ).rejects.toMatchObject({ code: "MEDIA_DELETION_UNCONFIRMED" })
            expect(
              await prisma.assistantAttachment.count({
                where: { id: ids.attachment },
              }),
            ).toBe(1)
            await prisma.assistantAttachment.update({
              where: { id: ids.attachment },
              data: original,
            })

            await expect(
              processAccountPrivacyPrivateAssistant(
                prisma,
                { ...input, operatorUserId: ids.other },
                async () => {
                  throw Error("provider must not be reached")
                },
              ),
            ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
            await expect(
              processAccountPrivacyPrivateAssistant(prisma, input, async () => {
                throw Error("simulated media failure")
              }),
            ).rejects.toMatchObject({ code: "MEDIA_DELETION_UNCONFIRMED" })
            expect(
              await prisma.assistantAttachment.count({
                where: { id: ids.attachment },
              }),
            ).toBe(1)
            let removed = 0
            const privateResult = await advanceTestWorkflow(
              prisma,
              { ...input, expectedStep: "ERASE_PRIVATE_ASSISTANT" },
              {
                ...providers,
                removePrivateAttachment: async (row) => {
                  expect(row.id).toBe(ids.attachment)
                  expect(row.dataClassification).toBe("QA")
                  removed++
                },
              },
            )
            expect(privateResult.executedStep).toBe("ERASE_PRIVATE_ASSISTANT")
            expect(removed).toBe(1)
            expect(
              await prisma.assistantConversation.count({
                where: { id: ids.conversation },
              }),
            ).toBe(0)
            expect(
              await prisma.assistantMessage.count({
                where: { conversationId: ids.otherConversation },
              }),
            ).toBe(1)
            expect(
              await prisma.assistantUsageEvent.count({
                where: { actorUserId: ids.subject },
              }),
            ).toBe(0)
            expect(
              await processAccountPrivacyPrivateAssistant(prisma, input),
            ).toMatchObject({ remaining: 0, replay: true })
          }
          expect(
            (await getAccountPrivacyWorkflow(prisma, input)).nextStep,
          ).toBe(expectedStep)
          expect(
            (
              await advanceTestWorkflow(
                prisma,
                { ...input, expectedStep },
                providers,
              )
            ).executedStep,
          ).toBe(expectedStep)
        }
        expect(await isAccountPrivacyAccessBlocked(prisma, ids.subject)).toBe(
          true,
        )
        expect(
          await prisma.session.count({ where: { userId: ids.subject } }),
        ).toBe(0)
        expect(await claimProductAnalyticsEvent(prisma, ids.event)).toBeNull()
        expect(
          await persistProductAnalyticsEvent(prisma, {
            id: ids.suppressed,
            userId: ids.subject,
            envelope: { synthetic: true },
          }),
        ).toBeNull()
        await expect(
          processAccountPrivacyActivity(prisma, input),
        ).rejects.toMatchObject({
          code: "ACTIVITY_PROVIDER_RECONCILIATION_REQUIRED",
        })
        expect(
          await prisma.productAnalyticsEvent.count({
            where: { id: ids.event },
          }),
        ).toBe(1)
        await settleProductAnalyticsEvent(prisma, {
          id: ids.event,
          leaseToken: claimed.leaseToken,
          delivered: false,
          attempts: claimed.attempts,
        })
        expect(
          (
            await advanceTestWorkflow(
              prisma,
              { ...input, expectedStep: "ERASE_ANALYTICS" },
              providers,
            )
          ).workflow.nextStep,
        ).toBe("REVIEW_EXTERNAL_PROCESSORS")
        expect(
          await prisma.productAnalyticsEvent.count({
            where: { userId: ids.subject },
          }),
        ).toBe(0)
        expect(
          await processAccountPrivacyActivity(prisma, input),
        ).toMatchObject({ analyticsRemoved: 0, replay: true })
        await expect(
          advanceAccountPrivacyWorkflow(
            prisma,
            { ...input, expectedStep: "REVIEW_EXTERNAL_PROCESSORS" },
            providers,
          ),
        ).rejects.toMatchObject({ code: "DOMAIN_REVIEW_REQUIRED" })
        await expect(
          advanceAccountPrivacyWorkflow(
            prisma,
            { ...input, expectedStep: "COMPLETE" },
            providers,
          ),
        ).rejects.toMatchObject({ code: "STALE_STEP" })
        const stored = await prisma.accountPrivacyRequest.findUniqueOrThrow({
          where: { id: requestId },
          select: { status: true, completedAt: true },
        })
        expect(stored).toEqual({ status: "PROCESSING", completedAt: null })
        expect(
          await prisma.accountPrivacyDomainOutcome.count({
            where: { requestId },
          }),
        ).toBe(6)
        expect(
          await prisma.accountPrivacyNoticeAttempt.count({
            where: { requestId },
          }),
        ).toBe(0)
        // Synthetic receipts test review integrity only, never real provider fulfilment.
        const externalPolicy = JSON.stringify({
          version: "qa-workflow-v1",
          approvalReference: "synthetic-receipt-test-only",
          approvedAt: new Date(Date.now() - 60000).toISOString(),
          reviewAt: new Date(Date.now() + 86400000).toISOString(),
          mode: "REVIEW_PROVIDER_CONFIRMATIONS",
          providers: [
            {
              key: "qa-fixture-provider",
              disposition: "ERASURE_CONFIRMED",
              purpose: "Synthetic adapter verification only",
              expiresAt: null,
            },
          ],
        })
        process.env.ACCOUNT_PRIVACY_EXTERNAL_REVIEW_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_EXTERNAL_POLICY_JSON = externalPolicy
        process.env.ACCOUNT_PRIVACY_APPROVED_EXTERNAL_POLICY_SHA256 =
          createHash("sha256").update(externalPolicy).digest("hex")
        const receipts = [
          {
            provider: "qa-fixture-provider",
            evidenceDigest: createHash("sha256")
              .update(`synthetic-only:${requestId}`)
              .digest("hex"),
            confirmedAt: new Date(),
          },
        ]
        const reviewInput = {
          ...input,
          confirmationsReviewed: true as const,
          receipts,
        }
        if (office) await office.externalReview(reviewInput)
        else
          expect(
            await recordAccountPrivacyExternalReview(prisma, reviewInput),
          ).toMatchObject({ replay: false, providersReviewed: 1 })
        expect(
          await recordAccountPrivacyExternalReview(prisma, reviewInput),
        ).toMatchObject({ replay: true })
        const profilePolicy = JSON.stringify({
          version: "qa-workflow-v1",
          approvalReference: "synthetic-profile-test-only",
          approvedAt: new Date(Date.now() - 60000).toISOString(),
          mode: "PSEUDONYMIZE",
          legalAcceptanceDisposition: "RETAIN",
          retentionPurpose: "Synthetic audit linkage test only",
          reviewAt: new Date(Date.now() + 86400000).toISOString(),
        })
        process.env.ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_PROFILE_POLICY_JSON = profilePolicy
        process.env.ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256 = createHash(
          "sha256",
        )
          .update(profilePolicy)
          .digest("hex")
        const prior = await prisma.accountPrivacyRequest.findUniqueOrThrow({
          where: { id: requestId },
          select: { outcome: true },
        })
        await prisma.accountPrivacyRequest.update({
          where: { id: requestId },
          data: { outcome: { tampered: true } },
        })
        await expect(
          processAccountPrivacyProfile(prisma, input),
        ).rejects.toMatchObject({ code: "NOT_READY" })
        await prisma.accountPrivacyRequest.update({
          where: { id: requestId },
          data: { outcome: prior.outcome ?? {} },
        })
        expect(
          (
            await advanceTestWorkflow(
              prisma,
              { ...input, expectedStep: "MINIMIZE_PROFILE" },
              providers,
            )
          ).workflow.nextStep,
        ).toBe("DELIVER_OUTCOME")
        expect(await processAccountPrivacyProfile(prisma, input)).toMatchObject(
          { replay: true, retainedLinkage: true },
        )
        expect(
          await prisma.account.count({ where: { userId: ids.subject } }),
        ).toBe(0)
        expect(
          await prisma.user.findUnique({
            where: { id: ids.subject },
            select: {
              name: true,
              phone: true,
              emailVerified: true,
              ageBand: true,
            },
          }),
        ).toEqual({
          name: "",
          phone: null,
          emailVerified: false,
          ageBand: "UNDECLARED",
        })
        await expect(
          advanceAccountPrivacyWorkflow(
            prisma,
            { ...input, expectedStep: "DELIVER_OUTCOME" },
            providers,
          ),
        ).rejects.toMatchObject({ code: "NOTICE_DELIVERY_REQUIRED" })
        if (office) await office.deliverAndComplete()
        expect(
          await prisma.user.findUnique({
            where: { id: ids.other },
            select: { name: true, emailVerified: true },
          }),
        ).toEqual({ name: "Unrelated synthetic account", emailVerified: true })
        expect(
          await prisma.session.count({ where: { userId: ids.other } }),
        ).toBe(1)
        expect(
          await prisma.account.count({ where: { userId: ids.other } }),
        ).toBe(1)
        expect(
          await prisma.productAnalyticsEvent.count({
            where: { id: ids.otherEvent },
          }),
        ).toBe(1)
      } finally {
        await office?.close()
        if (requestId) {
          await prisma.accountPrivacyNoticeAttempt.deleteMany({
            where: { requestId },
          })
          await prisma.accountPrivacyDomainOutcome.deleteMany({
            where: { requestId },
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
        }
        await prisma.tenant.deleteMany({ where: { id: ids.tenant } })
        await prisma.user.deleteMany({
          where: { id: { in: [ids.subject, ids.operator, ids.other] } },
        })
        expect(
          await prisma.user.count({
            where: { id: { in: [ids.subject, ids.operator, ids.other] } },
          }),
        ).toBe(0)
        expect(await prisma.tenant.count({ where: { id: ids.tenant } })).toBe(0)
        for (const key of keys) {
          if (previous[key] === undefined)
            Reflect.deleteProperty(process.env, key)
          else process.env[key] = previous[key]
        }
        await prisma.$disconnect()
      }
    })
  },
)
