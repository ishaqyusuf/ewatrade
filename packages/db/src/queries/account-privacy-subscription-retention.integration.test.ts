import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  accountPrivacyProfileEvidence,
  accountPrivacyPseudonymousEmail,
  getApprovedAccountPrivacyProfilePolicy,
} from "./account-privacy-profile-policy"
import {
  getAccountPrivacySubscriptionInventory,
  subscriptionPrivacyDigest,
} from "./account-privacy-subscription-inventory"
import {
  accountPrivacySubscriptionRetentionIsConfirmed,
  confirmAccountPrivacySubscriptions,
  inspectAccountPrivacySubscriptionRetention,
  inspectAccountPrivacySubscriptions,
  reassessAccountPrivacySubscriptions,
  reviewAccountPrivacySubscriptions,
} from "./account-privacy-subscription-retention"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(240_000)
const databaseTests = enabled ? describe : describe.skip
databaseTests(
  "paid-owner privacy on exact disposable Development records",
  () => {
    test("binds store and tenant-less Paystack inventory, rejects late refund evidence, serializes reviews and preserves another owner", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const subject = randomUUID()
      const operator = randomUUID()
      const other = randomUUID()
      const requestId = randomUUID()
      const accountId = randomUUID()
      const otherAccountId = randomUUID()
      const purchaseId = randomUUID()
      const journalId = randomUUID()
      const refundId = randomUUID()
      const now = new Date()
      const keys = [
        "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
        "ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED",
        "ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED",
        "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
        "ACCOUNT_PRIVACY_SUBSCRIPTION_POLICY_JSON",
        "ACCOUNT_PRIVACY_APPROVED_SUBSCRIPTION_POLICY_SHA256",
      ]
      const previous = Object.fromEntries(
        keys.map((key) => [key, process.env[key]]),
      )
      const email = `privacy-subscription-${subject}@example.test`
      const policy = {
        version: `fixture-${requestId}`,
        mode: "MINIMUM_NECESSARY_BILLING_RETENTION",
        approvedAt: now.toISOString(),
        documentDigest: "a".repeat(64),
        maximumReviewMonths: 12,
        maximumHoldDays: 90,
      }
      let created = false
      try {
        for (const key of keys.slice(0, 3)) process.env[key] = "true"
        process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = policy.version
        process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_POLICY_JSON =
          JSON.stringify(policy)
        process.env.ACCOUNT_PRIVACY_APPROVED_SUBSCRIPTION_POLICY_SHA256 =
          subscriptionPrivacyDigest(policy)
        await prisma.user.createMany({
          data: [
            {
              id: subject,
              name: "Synthetic subscription subject",
              email,
              emailVerified: true,
            },
            {
              id: operator,
              name: "Synthetic subscription operator",
              email: `privacy-subscription-${operator}@example.test`,
              emailVerified: true,
              isPlatformAdmin: true,
            },
            {
              id: other,
              name: "Unrelated synthetic owner",
              email: `privacy-subscription-${other}@example.test`,
              emailVerified: true,
            },
          ],
        })
        created = true
        await prisma.ownerBillingAccount.createMany({
          data: [
            { id: accountId, ownerUserId: subject },
            { id: otherAccountId, ownerUserId: other },
          ],
        })
        await prisma.ownerBillingPurchase.createMany({
          data: [accountId, otherAccountId].map((id, index) => ({
            id: index ? randomUUID() : purchaseId,
            accountId: id,
            provider: "APP_STORE",
            purchaseDigest: `fixture-${id}`,
            latestOrderDigest: `order-${id}`,
            productId: "fixture.product",
            environment: "sandbox",
            expiresAt: new Date(now.getTime() + 86400000),
            verifiedAt: now,
          })),
        })
        await prisma.accountPrivacyRequest.create({
          data: {
            id: requestId,
            requestKey: `account-deletion:${subject}`,
            userId: subject,
            verifiedSubjectUserId: subject,
            verifiedAt: now,
            contactEmail: email,
            status: "PROCESSING",
          },
        })
        await prisma.accountPrivacyAccessRevocation.create({
          data: {
            requestId,
            userId: subject,
            status: "REVOKED",
            completedAt: now,
          },
        })
        await prisma.billingProviderEvent.create({
          data: {
            id: journalId,
            provider: "OTHER",
            eventId: `owner-paystack-checkout:${journalId}`,
            type: "owner_paystack_checkout",
            status: "PROCESSED",
            processedAt: now,
            metadata: {
              ownerWeb: {
                accountId,
                environment: "sandbox",
                state: "paid",
                customerCode: "fixture-secret-customer",
              },
            },
            payload: {
              session: {
                id: journalId,
                requestedByUserId: subject,
                providerSessionId: "fixture-secret-reference",
                checkoutUrl: null,
              },
              ownerWeb: { accountId, state: "paid" },
            },
          },
        })
        const command = { requestId, operatorUserId: operator }
        const input = async () => {
          const inventory = await inspectAccountPrivacySubscriptions(
            prisma,
            command,
          )
          return {
            ...command,
            expectedInventoryDigest: inventory.inventoryDigest,
            policyDigest: subscriptionPrivacyDigest(policy),
            controllerEvidenceDigest: "b".repeat(64),
            minimumNecessaryReviewed: true as const,
            controllerAuthorityReviewed: true as const,
            shorterPoliciesAndHoldsReviewed: true as const,
            storeCancellationIsSeparate: true as const,
            decisions: [
              ...new Set(inventory.records.map((row) => row.family)),
            ].map((family) => ({
              family,
              purpose: "RECEIPT_ANTI_REPLAY" as const,
              necessityEvidenceDigest: "c".repeat(64),
              basisEvidenceDigest: "d".repeat(64),
              nextReviewAt: new Date(Date.now() + 86400000).toISOString(),
              basis: {
                kind: "EXPIRY" as const,
                expiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
              },
            })),
          }
        }
        const inspected = await inspectAccountPrivacySubscriptions(
          prisma,
          command,
        )
        expect(inspected.blockers).toEqual([])
        expect(inspected.counts.PROVIDER_EVENT).toBe(1)
        expect(JSON.stringify(inspected)).not.toContain("fixture-secret")
        await expect(
          confirmAccountPrivacySubscriptions(prisma, command),
        ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
        const review = await input()
        await reviewAccountPrivacySubscriptions(prisma, review)
        expect(
          await confirmAccountPrivacySubscriptions(prisma, command),
        ).toMatchObject({ recordsRetained: 3, replay: false })
        expect(
          await confirmAccountPrivacySubscriptions(prisma, command),
        ).toMatchObject({ replay: true })
        const outcome =
          await prisma.accountPrivacyDomainOutcome.findUniqueOrThrow({
            where: {
              requestId_domain: { requestId, domain: "SOFTWARE_SUBSCRIPTIONS" },
            },
          })
        expect(
          await accountPrivacySubscriptionRetentionIsConfirmed(prisma, {
            requestId,
            subjectId: subject,
            outcome,
            now: new Date(),
          }),
        ).toBe(true)
        // A separately committed provider worker can finish after the operator inspected/reviewed the case.
        await Promise.all([
          prisma.billingProviderEvent.create({
            data: {
              id: refundId,
              provider: "OTHER",
              eventId: `owner-paystack-refund:order-${accountId}`,
              type: "owner_paystack_refund",
              status: "PROCESSED",
              payload: { orderDigest: `order-${accountId}` },
            },
          }),
          prisma.ownerBillingPurchase.count({
            where: { accountId: otherAccountId },
          }),
        ])
        expect(
          await accountPrivacySubscriptionRetentionIsConfirmed(prisma, {
            requestId,
            subjectId: subject,
            outcome,
            now: new Date(),
          }),
        ).toBe(false)
        await expect(
          reviewAccountPrivacySubscriptions(prisma, review),
        ).rejects.toThrow("SOURCE_CHANGED")
        await expect(
          confirmAccountPrivacySubscriptions(prisma, command),
        ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
        await reviewAccountPrivacySubscriptions(prisma, await input())
        expect(
          await confirmAccountPrivacySubscriptions(prisma, command),
        ).toMatchObject({ recordsRetained: 4, replay: false })
        expect(
          await prisma.ownerBillingPurchase.count({
            where: { accountId: otherAccountId },
          }),
        ).toBe(1)
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: subject } }))
            .email,
        ).toBe(email)
        expect(
          await prisma.billingCheckoutSession.count({
            where: { requestedByUserId: subject },
          }),
        ).toBe(0)
        const fresh = await getAccountPrivacySubscriptionInventory(
          prisma,
          subject,
        )
        expect(fresh.counts.PROVIDER_EVENT).toBe(2)
        expect(
          await prisma.accountPrivacySubscriptionReview.count({
            where: { requestId, supersededAt: null },
          }),
        ).toBe(1)
        const competing = await input()
        await Promise.all([
          reviewAccountPrivacySubscriptions(prisma, {
            ...competing,
            controllerEvidenceDigest: "f".repeat(64),
          }),
          reviewAccountPrivacySubscriptions(prisma, {
            ...competing,
            controllerEvidenceDigest: "0".repeat(64),
          }),
        ])
        expect(
          await prisma.accountPrivacySubscriptionReview.count({
            where: { requestId, supersededAt: null },
          }),
        ).toBe(1)
        await confirmAccountPrivacySubscriptions(prisma, command)
        const retained =
          await prisma.accountPrivacySubscriptionReview.findFirstOrThrow({
            where: { requestId, supersededAt: null },
          })
        const { requestId: _, ...nextDecision } = await input()
        await prisma.accountPrivacyDomainOutcome.deleteMany({
          where: { requestId },
        })
        await prisma.accountPrivacyAccessRevocation.deleteMany({
          where: { requestId },
        })
        await prisma.accountPrivacyRequest.delete({ where: { id: requestId } })
        // Billing duties outlive case-evidence expiry; no fresh contact or login grant is needed.
        expect(
          (
            await inspectAccountPrivacySubscriptionRetention(prisma, {
              reviewId: retained.id,
              operatorUserId: operator,
            })
          ).inventoryDigest,
        ).toBe(nextDecision.expectedInventoryDigest)
        await reassessAccountPrivacySubscriptions(prisma, {
          ...nextDecision,
          reviewId: retained.id,
          controllerEvidenceDigest: "e".repeat(64),
        })
        expect(
          (
            await prisma.accountPrivacySubscriptionReview.findUniqueOrThrow({
              where: { id: retained.id },
            })
          ).supersededAt,
        ).not.toBeNull()
        expect(
          await prisma.accountPrivacySubscriptionReview.count({
            where: { requestId, supersededAt: null },
          }),
        ).toBe(1)
      } finally {
        if (created) {
          await prisma.accountPrivacyDomainOutcome.deleteMany({
            where: { requestId },
          })
          await prisma.accountPrivacyAccessRevocation.deleteMany({
            where: { requestId },
          })
          await prisma.accountPrivacyRequest.deleteMany({
            where: { id: requestId },
          })
          // Review duties deliberately have no request FK; explicitly remove only owned test rows.
          await prisma.accountPrivacySubscriptionReview.deleteMany({
            where: { requestId, subjectUserId: subject },
          })
          await prisma.billingProviderEvent.deleteMany({
            where: { id: { in: [journalId, refundId] } },
          })
          await prisma.ownerBillingPurchase.deleteMany({
            where: { accountId: { in: [accountId, otherAccountId] } },
          })
          await prisma.ownerBillingAccount.deleteMany({
            where: { id: { in: [accountId, otherAccountId] } },
          })
          await prisma.user.deleteMany({
            where: { id: { in: [subject, operator, other] } },
          })
          expect(
            await prisma.user.count({
              where: { id: { in: [subject, operator, other] } },
            }),
          ).toBe(0)
          expect(
            await prisma.accountPrivacySubscriptionReview.count({
              where: { requestId },
            }),
          ).toBe(0)
        }
        for (const key of keys) {
          if (previous[key] === undefined) delete process.env[key]
          else process.env[key] = previous[key]
        }
      }
    })
    test("resumes a minimized verified case with late billing data without reviving credentials", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const subject = randomUUID()
      const operator = randomUUID()
      const requestId = randomUUID()
      const accountId = randomUUID()
      const authId = randomUUID()
      const now = new Date()
      const originalEmail = `privacy-minimized-${subject}@example.test`
      const targetEmail = accountPrivacyPseudonymousEmail(requestId, subject)
      const keys = [
        "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
        "ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED",
        "ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED",
        "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
        "ACCOUNT_PRIVACY_SUBSCRIPTION_POLICY_JSON",
        "ACCOUNT_PRIVACY_APPROVED_SUBSCRIPTION_POLICY_SHA256",
        "ACCOUNT_PRIVACY_PROFILE_POLICY_JSON",
        "ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256",
      ]
      const previous = Object.fromEntries(
        keys.map((key) => [key, process.env[key]]),
      )
      const policy = {
        version: `fixture-${requestId}`,
        mode: "MINIMUM_NECESSARY_BILLING_RETENTION",
        approvedAt: now.toISOString(),
        documentDigest: "a".repeat(64),
        maximumReviewMonths: 12,
        maximumHoldDays: 90,
      }
      const profileSource = JSON.stringify({
        version: policy.version,
        approvalReference: "synthetic-late-billing-only",
        approvedAt: now.toISOString(),
        mode: "PSEUDONYMIZE",
        legalAcceptanceDisposition: "RETAIN",
        retentionPurpose: "Synthetic billing linkage",
        reviewAt: new Date(now.getTime() + 86400000).toISOString(),
      })
      let created = false
      try {
        for (const key of keys.slice(0, 3)) process.env[key] = "true"
        process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = policy.version
        process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_POLICY_JSON =
          JSON.stringify(policy)
        process.env.ACCOUNT_PRIVACY_APPROVED_SUBSCRIPTION_POLICY_SHA256 =
          subscriptionPrivacyDigest(policy)
        process.env.ACCOUNT_PRIVACY_PROFILE_POLICY_JSON = profileSource
        process.env.ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256 = createHash(
          "sha256",
        )
          .update(profileSource)
          .digest("hex")
        const profilePolicy = getApprovedAccountPrivacyProfilePolicy(
          process.env,
          now,
        )
        if (!profilePolicy) throw Error("Synthetic policy invalid")
        await prisma.user.createMany({
          data: [
            {
              id: subject,
              email: targetEmail,
              name: "",
              emailVerified: false,
              ageBand: "UNDECLARED",
            },
            {
              id: operator,
              email: `privacy-minimized-${operator}@example.test`,
              name: "Synthetic operator",
              emailVerified: true,
              isPlatformAdmin: true,
            },
          ],
        })
        created = true
        await prisma.ownerBillingAccount.create({
          data: { id: accountId, ownerUserId: subject },
        })
        await prisma.accountPrivacyRequest.create({
          data: {
            id: requestId,
            userId: subject,
            verifiedSubjectUserId: subject,
            requestKey: `account-deletion:${subject}`,
            verifiedAt: now,
            contactEmail: originalEmail,
            status: "PROCESSING",
          },
        })
        await prisma.accountPrivacyAccessRevocation.create({
          data: {
            requestId,
            userId: subject,
            status: "REVOKED",
            completedAt: now,
          },
        })
        const profileWhere = {
          requestId_domain: { requestId, domain: "ACCOUNT_PROFILE" as const },
        }
        await prisma.accountPrivacyDomainOutcome.create({
          data: {
            requestId,
            userId: subject,
            domain: "ACCOUNT_PROFILE",
            processor: "account-privacy-profile-v1",
            policyVersion: policy.version,
            disposition: "RETENTION_APPROVED",
            evidenceDigest: "0".repeat(64),
            nextReviewAt: new Date(profilePolicy.reviewAt),
            processedAt: now,
          },
        })
        await prisma.accountPrivacyDomainOutcome.create({
          data: {
            requestId,
            userId: subject,
            domain: "SOFTWARE_SUBSCRIPTIONS",
            processor: "account-privacy-subscription-empty-v1",
            policyVersion: policy.version,
            disposition: "NOT_APPLICABLE",
            evidenceDigest: "f".repeat(64),
            processedAt: now,
          },
        })
        const command = { requestId, operatorUserId: operator }
        await expect(
          inspectAccountPrivacySubscriptions(prisma, command),
        ).rejects.toThrow("NOT_READY")
        await prisma.accountPrivacyDomainOutcome.update({
          where: profileWhere,
          data: {
            evidenceDigest: accountPrivacyProfileEvidence({
              requestId,
              subjectId: subject,
              policy: profilePolicy,
              legalAcceptanceCount: 0,
            }),
          },
        })
        await prisma.account.create({
          data: {
            id: authId,
            userId: subject,
            providerId: "credential",
            accountId: subject,
            password: "synthetic-unused-hash",
          },
        })
        await expect(
          inspectAccountPrivacySubscriptions(prisma, command),
        ).rejects.toThrow("NOT_READY")
        await prisma.account.delete({ where: { id: authId } })
        const inventory = await inspectAccountPrivacySubscriptions(
          prisma,
          command,
        )
        expect(inventory.blockers).toEqual([])
        await reviewAccountPrivacySubscriptions(prisma, {
          ...command,
          expectedInventoryDigest: inventory.inventoryDigest,
          policyDigest: subscriptionPrivacyDigest(policy),
          controllerEvidenceDigest: "b".repeat(64),
          minimumNecessaryReviewed: true,
          controllerAuthorityReviewed: true,
          shorterPoliciesAndHoldsReviewed: true,
          storeCancellationIsSeparate: true,
          decisions: [
            {
              family: "OWNER_ACCOUNT",
              purpose: "RECEIPT_ANTI_REPLAY",
              necessityEvidenceDigest: "c".repeat(64),
              basisEvidenceDigest: "d".repeat(64),
              nextReviewAt: new Date(now.getTime() + 86400000).toISOString(),
              basis: {
                kind: "EXPIRY",
                expiresAt: new Date(now.getTime() + 2 * 86400000).toISOString(),
              },
            },
          ],
        })
        expect(
          await confirmAccountPrivacySubscriptions(prisma, command),
        ).toMatchObject({ recordsRetained: 1, replay: false })
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: subject } }))
            .email,
        ).toBe(targetEmail)
        expect(await prisma.account.count({ where: { userId: subject } })).toBe(
          0,
        )
      } finally {
        if (created) {
          await prisma.account.deleteMany({
            where: { id: authId, userId: subject },
          })
          await prisma.accountPrivacyDomainOutcome.deleteMany({
            where: { requestId },
          })
          await prisma.accountPrivacyAccessRevocation.deleteMany({
            where: { requestId },
          })
          await prisma.accountPrivacyRequest.deleteMany({
            where: { id: requestId },
          })
          await prisma.accountPrivacySubscriptionReview.deleteMany({
            where: { requestId, subjectUserId: subject },
          })
          await prisma.ownerBillingAccount.deleteMany({
            where: { id: accountId, ownerUserId: subject },
          })
          await prisma.user.deleteMany({
            where: { id: { in: [subject, operator] } },
          })
          expect(
            await prisma.user.count({
              where: { id: { in: [subject, operator] } },
            }),
          ).toBe(0)
        }
        for (const key of keys) {
          if (previous[key] === undefined)
            Reflect.deleteProperty(process.env, key)
          else process.env[key] = previous[key]
        }
      }
    })
  },
)
