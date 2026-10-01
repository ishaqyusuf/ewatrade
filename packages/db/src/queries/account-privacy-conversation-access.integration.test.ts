import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { revokeAccountPrivacyConversationAccess } from "./account-privacy-conversation-access"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(120_000)
const describeWithDatabase = enabled ? describe : describe.skip

describeWithDatabase(
  "account privacy conversation access on guarded Neon fixture",
  () => {
    test("revokes the account link and preserves the independent Guest credential", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const fixtureId = randomUUID()
      const operatorUserId = randomUUID()
      const subjectUserId = randomUUID()
      const tenantId = randomUUID()
      const storeId = randomUUID()
      const connectionId = randomUUID()
      const guestIdentityId = randomUUID()
      const conversationId = randomUUID()
      const requestId = randomUUID()
      const now = new Date()
      const previous = {
        processing: process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED,
        conversation:
          process.env.ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED,
      }
      let usersCreated = false
      try {
        await prisma.user.createMany({
          data: [
            {
              id: operatorUserId,
              email: `privacy-conversation-operator-${fixtureId}@example.test`,
              emailVerified: true,
              isPlatformAdmin: true,
              name: "Privacy Conversation QA Operator",
            },
            {
              id: subjectUserId,
              email: `privacy-conversation-subject-${fixtureId}@example.test`,
              emailVerified: true,
              name: "Privacy Conversation QA Subject",
            },
          ],
        })
        usersCreated = true
        await prisma.tenant.create({
          data: {
            id: tenantId,
            slug: `privacy-conversation-${fixtureId}`,
            name: "Privacy Conversation QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "privacy-conversation.test",
            qaMarkedAt: now,
          },
        })
        await prisma.store.create({
          data: {
            id: storeId,
            tenantId,
            slug: `privacy-conversation-store-${fixtureId}`,
            name: "Privacy Conversation QA Store",
            status: "ACTIVE",
          },
        })
        await prisma.storeConversationGuestIdentity.create({
          data: {
            id: guestIdentityId,
            credentials: {
              create: {
                tokenDigest: fixtureId.replaceAll("-", ""),
                purpose: "WEB_DEVICE",
                expiresAt: new Date(now.getTime() + 86_400_000),
              },
            },
          },
        })
        await prisma.storeConversation.create({
          data: { id: conversationId, tenantId, storeId, guestIdentityId },
        })
        const accountAccess =
          await prisma.storeConversationAccountAccess.create({
            data: {
              tenantId,
              storeId,
              conversationId,
              accountUserId: subjectUserId,
              linkedGuestIdentityId: guestIdentityId,
            },
          })
        await prisma.whatsAppConnection.create({
          data: {
            id: connectionId,
            tenantId,
            wabaId: `fixture-waba-${fixtureId}`,
            phoneNumberId: `fixture-phone-${fixtureId}`,
            displayNumber: "+2340000000000",
            credentialReference: `fixture-credential-${fixtureId}`,
            createdByUserId: operatorUserId,
          },
        })
        await prisma.storeConversationWhatsAppBridgeCapability.createMany({
          data: [
            {
              tenantId,
              storeId,
              conversationId,
              connectionId,
              accountAccessId: accountAccess.id,
              clientOperationId: `account-${fixtureId}`,
              payloadHash: "a".repeat(64),
              tokenDigest: `account-${fixtureId}`,
              expiresAt: new Date(now.getTime() + 86_400_000),
            },
            {
              tenantId,
              storeId,
              conversationId,
              connectionId,
              guestIdentityId,
              clientOperationId: `guest-${fixtureId}`,
              payloadHash: "b".repeat(64),
              tokenDigest: `guest-${fixtureId}`,
              expiresAt: new Date(now.getTime() + 86_400_000),
            },
          ],
        })
        await prisma.accountPrivacyRequest.create({
          data: {
            id: requestId,
            requestKey: `account-deletion:${subjectUserId}`,
            userId: subjectUserId,
            verifiedSubjectUserId: subjectUserId,
            verifiedAt: now,
            status: "PROCESSING",
            accessRevocation: {
              create: { userId: subjectUserId, status: "REVOKED" },
            },
          },
        })
        process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
        process.env.ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED =
          "true"
        const command = { requestId, operatorUserId, now }
        expect(
          await revokeAccountPrivacyConversationAccess(prisma, command),
        ).toMatchObject({
          accountLinksRevoked: 1,
          bridgeCapabilitiesRevoked: 1,
          replay: false,
          conversationOutcomeRecorded: false,
        })
        expect(
          await prisma.storeConversationAccountAccess.findUnique({
            where: { conversationId },
            select: { status: true, revokedAt: true },
          }),
        ).toEqual({ status: "REVOKED", revokedAt: now })
        expect(
          await prisma.storeConversationGuestCredential.count({
            where: { guestIdentityId, status: "ACTIVE" },
          }),
        ).toBe(1)
        expect(
          await prisma.storeConversationWhatsAppBridgeCapability.count({
            where: { guestIdentityId, status: "PENDING" },
          }),
        ).toBe(1)
        expect(
          await revokeAccountPrivacyConversationAccess(prisma, command),
        ).toMatchObject({ accountLinksRevoked: 0, replay: true })
        expect(
          await prisma.accountPrivacyDomainOutcome.count({
            where: { requestId, domain: "CONVERSATIONS" },
          }),
        ).toBe(0)
      } finally {
        const restore = (name: string, value: string | undefined) => {
          if (value === undefined) Reflect.deleteProperty(process.env, name)
          else process.env[name] = value
        }
        restore("ACCOUNT_PRIVACY_PROCESSING_ENABLED", previous.processing)
        restore(
          "ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED",
          previous.conversation,
        )
        try {
          if (usersCreated) {
            await prisma.accountPrivacyAccessRevocation.deleteMany({
              where: { requestId },
            })
            await prisma.accountPrivacyRequest.deleteMany({
              where: { id: requestId },
            })
            await prisma.storeConversationWhatsAppBridgeCapability.deleteMany({
              where: { conversationId },
            })
            await prisma.storeConversationAccountAccess.deleteMany({
              where: { conversationId },
            })
            await prisma.storeConversation.deleteMany({
              where: { id: conversationId },
            })
            await prisma.storeConversationGuestCredential.deleteMany({
              where: { guestIdentityId },
            })
            await prisma.storeConversationGuestIdentity.deleteMany({
              where: { id: guestIdentityId },
            })
            await prisma.store.deleteMany({ where: { id: storeId } })
            await prisma.whatsAppConnection.deleteMany({
              where: { id: connectionId },
            })
            await prisma.tenant.deleteMany({ where: { id: tenantId } })
            await prisma.user.deleteMany({
              where: { id: { in: [operatorUserId, subjectUserId] } },
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
