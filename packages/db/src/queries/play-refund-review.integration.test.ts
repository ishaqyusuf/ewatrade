import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  getPlayRefundReviewQueue,
  recordPlayRefundReviewCase,
} from "./play-refund-review"
import {
  claimPlayRefundReviewResponse,
  inspectPlayRefundReviewResponseCustody,
  preparePlayRefundReviewResponse,
  recordPlayRefundReviewResponseOutcome,
} from "./play-refund-review-response"
import { storeOrderDigest } from "./store-subscriptions"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
;(enabled ? describe : describe.skip)(
  "Play refund-review custody on guarded Neon fixture",
  () => {
    test("records one encrypted case without changing entitlement", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const id = randomUUID()
      const tenantId = randomUUID()
      const adminUserId = randomUUID()
      const ordinaryUserId = randomUUID()
      const pendingRefundToken = `fixture-refund-${id}`
      const orderId = `GPA.fixture-order-${id}`
      const occurredAt = new Date("2026-09-25T10:00:00.000Z")
      const responseDueAt = new Date("2026-09-26T10:00:00.000Z")
      let created = false
      try {
        await prisma.tenant.create({
          data: {
            id: tenantId,
            slug: `play-refund-${id}`,
            name: "Play Refund Review QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "play-refund-review.test",
            qaMarkedAt: new Date(),
          },
        })
        created = true
        await prisma.user.createMany({
          data: [
            {
              id: adminUserId,
              email: `play-admin-${id}@test.com`,
              isPlatformAdmin: true,
            },
            {
              id: ordinaryUserId,
              email: `play-ordinary-${id}@test.com`,
            },
          ],
        })
        const account = await prisma.storeBillingAccount.create({
          data: { tenantId },
        })
        await prisma.storeSubscriptionPurchase.create({
          data: {
            tenantId,
            provider: "PLAY_STORE",
            purchaseDigest: `fixture-${id}`,
            latestOrderDigest: storeOrderDigest(orderId),
            productId: "fixture.pro.monthly",
            environment: "sandbox",
            expiresAt: new Date("2026-10-25T10:00:00.000Z"),
          },
        })
        const input = {
          pendingRefundToken,
          encryptedPendingToken: "v1.synthetic-fixture-envelope",
          encryptedOrderId: "v1.synthetic-order-envelope",
          encryptionKeyId: "fixture-key",
          orderId,
          obfuscatedAccountId: account.id,
          refundReason: 7,
          occurredAt,
          responseDueAt,
        }
        const first = await recordPlayRefundReviewCase(prisma, input)
        const replay = await recordPlayRefundReviewCase(prisma, {
          ...input,
          encryptedPendingToken: "v1.replayed-ciphertext",
          encryptedOrderId: "v1.replayed-order-ciphertext",
        })
        expect(replay).toEqual(first)
        expect(first.tenantId).toBe(tenantId)
        const stored = await prisma.playRefundReviewCase.findUniqueOrThrow({
          where: { id: first.id },
        })
        expect(stored.encryptedPendingToken).toBe(input.encryptedPendingToken)
        expect(stored.encryptedOrderId).toBe(input.encryptedOrderId)
        expect(JSON.stringify(stored)).not.toContain(pendingRefundToken)
        expect(JSON.stringify(stored)).not.toContain(orderId)
        expect(stored.orderDigest).toBe(storeOrderDigest(orderId))
        await prisma.playRefundReviewCase.update({
          where: { id: first.id },
          data: { encryptedOrderId: null },
        })
        const rotated = {
          ...input,
          encryptedPendingToken: "v1.rotated-token-envelope",
          encryptedOrderId: "v1.rotated-order-envelope",
          encryptionKeyId: "rotated-fixture-key",
        }
        await recordPlayRefundReviewCase(prisma, rotated)
        expect(
          await prisma.playRefundReviewCase.findUniqueOrThrow({
            where: { id: first.id },
            select: {
              encryptedPendingToken: true,
              encryptedOrderId: true,
              encryptionKeyId: true,
            },
          }),
        ).toEqual({
          encryptedPendingToken: rotated.encryptedPendingToken,
          encryptedOrderId: rotated.encryptedOrderId,
          encryptionKeyId: rotated.encryptionKeyId,
        })
        const queue = await getPlayRefundReviewQueue(prisma, responseDueAt)
        expect(queue.cases.some((item) => item.id === first.id)).toBe(true)
        expect(JSON.stringify(queue)).not.toContain(pendingRefundToken)
        expect(JSON.stringify(queue)).not.toContain("encryptedPendingToken")
        expect(JSON.stringify(queue)).not.toContain("encryptedOrderId")
        expect(
          await prisma.tenantSubscription.findUnique({ where: { tenantId } }),
        ).toBeNull()
        const unbound = await recordPlayRefundReviewCase(prisma, {
          ...input,
          pendingRefundToken: `fixture-unbound-${id}`,
          obfuscatedAccountId: randomUUID(),
        })
        expect(unbound.tenantId).toBeNull()
        const decision = {
          caseId: first.id,
          actorUserId: adminUserId,
          preference: "NEUTRAL" as const,
          sampleContentProvided: false,
          policyVersion: "sandbox-refund-review-v1",
          decisionEvidenceDigest: "a".repeat(64),
          now: new Date("2026-09-25T11:00:00.000Z"),
        }
        await expect(
          preparePlayRefundReviewResponse(prisma, {
            ...decision,
            actorUserId: ordinaryUserId,
          }),
        ).rejects.toThrow("operator required")
        await expect(
          preparePlayRefundReviewResponse(prisma, {
            ...decision,
            caseId: unbound.id,
          }),
        ).rejects.toThrow("case not ready")
        const prepared = await preparePlayRefundReviewResponse(prisma, decision)
        expect(await preparePlayRefundReviewResponse(prisma, decision)).toEqual(
          prepared,
        )
        await expect(
          preparePlayRefundReviewResponse(prisma, {
            ...decision,
            preference: "APPROVE",
          }),
        ).rejects.toThrow("response conflict")
        await expect(
          preparePlayRefundReviewResponse(prisma, {
            ...decision,
            decisionEvidenceDigest: "b".repeat(64),
          }),
        ).rejects.toThrow("response conflict")
        for (const incomplete of [
          { encryptedPendingToken: "" },
          { encryptedOrderId: null },
          { encryptionKeyId: "" },
          { tokenDigest: "" },
          { orderDigest: "" },
        ]) {
          await prisma.playRefundReviewCase.update({
            where: { id: first.id },
            data: incomplete,
          })
          await expect(
            claimPlayRefundReviewResponse(prisma, {
              responseId: prepared.id,
              now: decision.now,
              env: {
                PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
                STORE_BILLING_ENVIRONMENT: "sandbox",
                APP_ENV: "local",
              },
            }),
          ).rejects.toThrow("case not ready")
          expect(
            (
              await prisma.playRefundReviewResponse.findUniqueOrThrow({
                where: { id: prepared.id },
                select: { status: true },
              })
            ).status,
          ).toBe("PREPARED")
          await prisma.playRefundReviewCase.update({
            where: { id: first.id },
            data: {
              encryptedPendingToken: rotated.encryptedPendingToken,
              encryptedOrderId: rotated.encryptedOrderId,
              encryptionKeyId: rotated.encryptionKeyId,
              tokenDigest: stored.tokenDigest,
              orderDigest: stored.orderDigest,
            },
          })
        }
        await expect(
          claimPlayRefundReviewResponse(prisma, {
            responseId: prepared.id,
            now: decision.now,
            env: {},
          }),
        ).rejects.toThrow("submission disabled")
        const inspected = await inspectPlayRefundReviewResponseCustody(prisma, {
          responseId: prepared.id,
          now: decision.now,
        })
        await expect(
          claimPlayRefundReviewResponse(prisma, {
            responseId: prepared.id,
            now: decision.now,
            expected: { ...inspected, orderDigest: "changed-order" },
            env: {
              PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
              STORE_BILLING_ENVIRONMENT: "sandbox",
              APP_ENV: "local",
            },
          }),
        ).rejects.toThrow("response conflict")
        expect(
          (
            await prisma.playRefundReviewResponse.findUniqueOrThrow({
              where: { id: prepared.id },
              select: { status: true },
            })
          ).status,
        ).toBe("PREPARED")
        const claim = await claimPlayRefundReviewResponse(prisma, {
          responseId: prepared.id,
          now: decision.now,
          expected: inspected,
          env: {
            PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
            STORE_BILLING_ENVIRONMENT: "sandbox",
            APP_ENV: "local",
          },
        })
        expect(claim.encryptedPendingToken).toBe(rotated.encryptedPendingToken)
        expect(claim.encryptedOrderId).toBe(rotated.encryptedOrderId)
        expect(claim.encryptionKeyId).toBe(rotated.encryptionKeyId)
        await expect(
          claimPlayRefundReviewResponse(prisma, {
            responseId: prepared.id,
            now: decision.now,
            env: {
              PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
              STORE_BILLING_ENVIRONMENT: "sandbox",
              APP_ENV: "local",
            },
          }),
        ).rejects.toThrow("case not ready")
        expect(
          await recordPlayRefundReviewResponseOutcome(prisma, {
            responseId: prepared.id,
            outcome: "UNCERTAIN",
            now: decision.now,
          }),
        ).toEqual({ responseId: prepared.id, status: "UNCERTAIN" })
        await expect(
          recordPlayRefundReviewResponseOutcome(prisma, {
            responseId: prepared.id,
            outcome: "CONFIRMED",
          }),
        ).rejects.toThrow("response conflict")
        const countAt = new Date("2026-09-27T10:00:00.000Z")
        const beforeConfirmed = await getPlayRefundReviewQueue(prisma, countAt)
        const confirmedCase = await recordPlayRefundReviewCase(prisma, {
          ...input,
          pendingRefundToken: `fixture-confirmed-${id}`,
          encryptedPendingToken: "v1.confirmed-fixture-envelope",
        })
        const confirmed = await preparePlayRefundReviewResponse(prisma, {
          ...decision,
          caseId: confirmedCase.id,
        })
        await claimPlayRefundReviewResponse(prisma, {
          responseId: confirmed.id,
          now: decision.now,
          env: {
            PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
            STORE_BILLING_ENVIRONMENT: "sandbox",
            APP_ENV: "local",
          },
        })
        await recordPlayRefundReviewResponseOutcome(prisma, {
          responseId: confirmed.id,
          outcome: "CONFIRMED",
          now: decision.now,
        })
        const unresolvedQueue = await getPlayRefundReviewQueue(prisma, countAt)
        expect(unresolvedQueue.total).toBe(beforeConfirmed.total)
        expect(unresolvedQueue.overdue).toBe(beforeConfirmed.overdue)
        expect(
          unresolvedQueue.cases.some((item) => item.id === confirmedCase.id),
        ).toBe(false)
        expect(
          unresolvedQueue.cases.find((item) => item.id === first.id)
            ?.responseStatus,
        ).toBe("UNCERTAIN")
        expect(
          JSON.stringify(await getPlayRefundReviewQueue(prisma)),
        ).not.toContain("encryptedOrderId")
        await expect(
          recordPlayRefundReviewCase(prisma, {
            ...input,
            orderId: `GPA.other-${id}`,
          }),
        ).rejects.toThrow("identity changed")
      } finally {
        if (created) {
          await prisma.playRefundReviewCase.deleteMany({
            where: { orderDigest: storeOrderDigest(orderId) },
          })
          await prisma.storeSubscriptionPurchase.deleteMany({
            where: { tenantId },
          })
          await prisma.tenant.delete({ where: { id: tenantId } })
          await prisma.user.deleteMany({
            where: { id: { in: [adminUserId, ordinaryUserId] } },
          })
        }
        await prisma.$disconnect()
      }
    })
  },
)
