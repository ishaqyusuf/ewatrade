import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { revokeAccountPrivacyMembershipAccess } from "./account-privacy-membership"
import { confirmNoAccountPrivacySubscriptions } from "./account-privacy-subscription"

const describeWithDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1")
  setDefaultTimeout(120_000)

describeWithDatabase(
  "account privacy membership on guarded Neon fixture",
  () => {
    test("blocks owner and assignment gaps, then scopes removal and replays", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const fixtureId = randomUUID()
      const userIds = [randomUUID(), randomUUID(), randomUUID()]
      const [operatorUserId, subjectUserId, successorUserId] = userIds
      if (!operatorUserId || !subjectUserId || !successorUserId)
        throw new Error("Fixture identities missing")
      const tenantId = randomUUID()
      const secondTenantId = randomUUID()
      const storeId = randomUUID()
      const membershipId = randomUUID()
      const secondMembershipId = randomUUID()
      const requestId = randomUUID()
      const now = new Date()
      let fixtureCreated = false
      const previous = {
        base: process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED,
        membership: process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED,
        subscription:
          process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED,
        policy: process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION,
      }
      try {
        await prisma.user.createMany({
          data: [
            {
              id: operatorUserId,
              email: `privacy-operator-${fixtureId}@example.test`,
              emailVerified: true,
              isPlatformAdmin: true,
              name: "Privacy Fixture Operator",
            },
            {
              id: subjectUserId,
              email: `privacy-subject-${fixtureId}@example.test`,
              emailVerified: true,
              name: "Privacy Fixture Subject",
            },
            {
              id: successorUserId,
              email: `privacy-successor-${fixtureId}@example.test`,
              emailVerified: true,
              name: "Privacy Fixture Successor",
            },
          ],
        })
        fixtureCreated = true
        await prisma.tenant.create({
          data: {
            id: tenantId,
            slug: `privacy-membership-${fixtureId}`,
            name: "Privacy Membership QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "privacy-membership.test",
            qaMarkedAt: now,
          },
        })
        await prisma.tenant.create({
          data: {
            id: secondTenantId,
            slug: `privacy-membership-second-${fixtureId}`,
            name: "Privacy Membership Second Tenant QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "privacy-membership.test",
            qaMarkedAt: now,
          },
        })
        await prisma.store.create({
          data: {
            id: storeId,
            tenantId,
            slug: `privacy-membership-store-${fixtureId}`,
            name: "Privacy Membership QA Store",
            status: "ACTIVE",
          },
        })
        await prisma.membership.create({
          data: {
            id: membershipId,
            tenantId,
            userId: subjectUserId,
            role: "OWNER",
            status: "ACTIVE",
          },
        })
        await prisma.membership.createMany({
          data: [
            {
              id: secondMembershipId,
              tenantId: secondTenantId,
              userId: subjectUserId,
              role: "MEMBER",
              status: "ACTIVE",
            },
            {
              tenantId: secondTenantId,
              userId: successorUserId,
              role: "OWNER",
              status: "ACTIVE",
            },
          ],
        })
        await prisma.retailOpsStaffProfile.create({
          data: {
            tenantId,
            userId: subjectUserId,
            membershipId,
            displayName: "Privacy Fixture Subject",
            roleSnapshot: "OWNER",
            statusSnapshot: "ACTIVE",
          },
        })
        await prisma.retailOpsStaffProfile.create({
          data: {
            tenantId: secondTenantId,
            userId: subjectUserId,
            membershipId: secondMembershipId,
            displayName: "Privacy Fixture Subject",
            roleSnapshot: "MEMBER",
            statusSnapshot: "ACTIVE",
          },
        })
        await prisma.retailOpsStaffInviteToken.create({
          data: {
            tenantId,
            membershipId,
            invitedUserId: subjectUserId,
            email: `privacy-subject-${fixtureId}@example.test`,
            role: "OWNER",
            tokenHash: fixtureId,
            invitedByUserId: operatorUserId,
            expiresAt: new Date(now.getTime() + 86_400_000),
          },
        })
        const unrelatedInvite = await prisma.retailOpsStaffInviteToken.create({
          data: {
            tenantId,
            invitedUserId: successorUserId,
            email: `privacy-successor-${fixtureId}@example.test`,
            role: "OWNER",
            tokenHash: `unrelated-${fixtureId}`,
            invitedByUserId: operatorUserId,
            expiresAt: new Date(now.getTime() + 86_400_000),
          },
        })
        await prisma.accountPrivacyRequest.create({
          data: {
            id: requestId,
            userId: subjectUserId,
            verifiedSubjectUserId: subjectUserId,
            requestKey: `privacy-membership-fixture-${fixtureId}`,
            contactEmail: `privacy-subject-${fixtureId}@example.test`,
            status: "PROCESSING",
            verifiedAt: now,
            accessRevocation: {
              create: { userId: subjectUserId, status: "REVOKED" },
            },
          },
        })
        process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION =
          "qa-privacy-membership-v1"
        await expect(
          revokeAccountPrivacyMembershipAccess(prisma, {
            requestId,
            operatorUserId,
            now,
          }),
        ).rejects.toMatchObject({ code: "OWNER_HANDOVER_REQUIRED" })
        expect(
          await prisma.membership.count({
            where: { id: membershipId, status: "ACTIVE" },
          }),
        ).toBe(1)
        expect(
          await prisma.accountPrivacyDomainOutcome.count({
            where: { requestId },
          }),
        ).toBe(0)

        await prisma.membership.create({
          data: {
            tenantId,
            userId: successorUserId,
            role: "OWNER",
            status: "ACTIVE",
          },
        })
        const activeAssignment =
          await prisma.serviceCommerceStoreTeamAssignment.create({
            data: {
              tenantId,
              storeId,
              membershipId,
              capability: "ATTENDANT",
              status: "ACTIVE",
              assignedByUserId: operatorUserId,
            },
          })
        await expect(
          revokeAccountPrivacyMembershipAccess(prisma, {
            requestId,
            operatorUserId,
            now,
          }),
        ).rejects.toMatchObject({ code: "WORK_HANDOVER_REQUIRED" })
        expect(
          await prisma.membership.count({
            where: { id: membershipId, status: "ACTIVE" },
          }),
        ).toBe(1)
        await prisma.serviceCommerceStoreTeamAssignment.update({
          where: { id: activeAssignment.id },
          data: {
            status: "REVOKED",
            revokedAt: now,
            revokedByUserId: operatorUserId,
          },
        })
        const first = await revokeAccountPrivacyMembershipAccess(prisma, {
          requestId,
          operatorUserId,
          now,
        })
        expect(first).toMatchObject({
          membershipsRemoved: 2,
          staffProfilesRemoved: 2,
          invitationsRevoked: 1,
          outcomeRecorded: true,
          replay: false,
        })
        const replay = await revokeAccountPrivacyMembershipAccess(prisma, {
          requestId,
          operatorUserId,
          now,
        })
        expect(replay.replay).toBe(true)
        expect(
          await prisma.retailOpsStaffInviteToken.count({
            where: { id: unrelatedInvite.id, status: "ACTIVE" },
          }),
        ).toBe(1)
        expect(
          await prisma.accountPrivacyDomainOutcome.count({
            where: { requestId, domain: "MEMBERSHIP" },
          }),
        ).toBe(1)
        const noSubscription = await confirmNoAccountPrivacySubscriptions(
          prisma,
          { requestId, operatorUserId, now: new Date() },
        )
        expect(noSubscription).toMatchObject({
          outcomeRecorded: true,
          replay: false,
        })
        expect(
          await confirmNoAccountPrivacySubscriptions(prisma, {
            requestId,
            operatorUserId,
            now: new Date(),
          }),
        ).toMatchObject({ replay: true })
        expect(
          await prisma.accountPrivacyDomainOutcome.count({
            where: { requestId, domain: "SOFTWARE_SUBSCRIPTIONS" },
          }),
        ).toBe(1)
        expect(
          await prisma.membership.count({
            where: { tenantId, userId: successorUserId, status: "ACTIVE" },
          }),
        ).toBe(1)
        expect(
          await prisma.membership.count({
            where: {
              tenantId: secondTenantId,
              userId: successorUserId,
              status: "ACTIVE",
            },
          }),
        ).toBe(1)
        expect(
          await prisma.retailOpsStaffLifecycleEvent.count({
            where: { tenantId, staffUserId: subjectUserId, type: "REMOVED" },
          }),
        ).toBe(1)
        expect(
          await prisma.retailOpsStaffLifecycleEvent.count({
            where: {
              tenantId: secondTenantId,
              staffUserId: subjectUserId,
              type: "REMOVED",
            },
          }),
        ).toBe(1)
      } finally {
        process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = previous.base
        process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED =
          previous.membership
        process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED =
          previous.subscription
        process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = previous.policy
        try {
          if (fixtureCreated) {
            await prisma.accountPrivacyDomainOutcome.deleteMany({
              where: { requestId },
            })
            await prisma.accountPrivacyAccessRevocation.deleteMany({
              where: { requestId },
            })
            await prisma.accountPrivacyRequest.deleteMany({
              where: { id: requestId },
            })
            await prisma.tenant.deleteMany({
              where: { id: { in: [tenantId, secondTenantId] } },
            })
            await prisma.user.deleteMany({ where: { id: { in: userIds } } })
            expect(
              await prisma.accountPrivacyRequest.count({
                where: { id: requestId },
              }),
            ).toBe(0)
            expect(
              await prisma.tenant.count({
                where: { id: { in: [tenantId, secondTenantId] } },
              }),
            ).toBe(0)
            expect(
              await prisma.user.count({ where: { id: { in: userIds } } }),
            ).toBe(0)
          }
        } finally {
          await prisma.$disconnect()
        }
      }
    })
  },
)
