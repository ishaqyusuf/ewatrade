import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"

import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  issueCommerceInquiryQuote,
  transitionCommerceInquiry,
} from "../../commerce-inquiries"
import { publishCustomerEntryPoint } from "../../customer-channels"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  bootstrapWebStoreConversation,
  claimMobileStoreConversationTransfer,
  createWebStoreConversationTransfer,
  dismissGuestStoreConversationAccountInvitation,
  getAccountStoreConversationTimeline,
  getGuestStoreConversationTimeline,
  getMobileStoreConversationTimeline,
  linkGuestStoreConversationsToAccount,
  listGuestStoreConversationAccountCandidates,
  listStoreConversationAccountConversations,
  listStoreConversationAccountDevices,
  redeemMobileStoreConversationTransfer,
  revokeStoreConversationAccountDevice,
  selectGuestStoreConversationRequest,
  sendAccountStoreConversationText,
  sendGuestStoreConversationText,
} from "../../store-conversations"
import { describeWithServiceCommerceDatabase } from "./database"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

setDefaultTimeout(300_000)

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
    booking: false,
    delivery: false,
    intake: true,
    payment: true,
    pickup: true,
    progressive_catalog: true,
    quote: true,
    service_completion: false,
    staff: true,
    web: true,
    whatsapp: false,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: false,
}

function issueActionToken(input: {
  clientCapabilityId: string
  storeId: string
  tenantId: string
}) {
  return `conversation_action_${createHash("sha256")
    .update(`${input.tenantId}:${input.storeId}:${input.clientCapabilityId}`)
    .digest("hex")}`
}

describeWithServiceCommerceDatabase(
  "Store Conversation optional Customer Account adoption",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture
    let publicToken: string

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const configured = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Configure Store Conversation account adoption acceptance",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: configured.revision,
        reason: "Activate Store Conversation account adoption acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      publicToken = (
        await publishCustomerEntryPoint(fixture.db, {
          actorUserId: fixture.actorUserId,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        })
      ).publicToken
    })

    afterAll(async () => {
      if (!fixture) return
      const tenantId = fixture.tenantId
      const userIds = [...fixture.cleanupUserIds]
      await disposeServiceCommerceAcceptanceFixture(fixture)
      expect(
        await Promise.all([
          fixture.db.tenant.count({ where: { id: tenantId } }),
          fixture.db.user.count({ where: { id: { in: userIds } } }),
        ]),
      ).toEqual([0, 0])
    })

    test("keeps guest access while explicitly linking an account and revoking one transferred device", async () => {
      const runId = randomUUID()
      const tenantCustomersBefore = await fixture.db.customer.count({
        where: { tenantId: fixture.tenantId },
      })
      const web = await bootstrapWebStoreConversation(fixture.db, {
        publicToken,
      })
      if (!web.credentialToken) throw new Error("Web credential missing")

      const intake = await sendGuestStoreConversationText(fixture.db, {
        clientOperationId: `account-intake-${runId}`,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        publicToken,
        requestIntent: "choose_request",
        text: "Please quote one available item.",
      })
      const selected = await selectGuestStoreConversationRequest(fixture.db, {
        clientOperationId: `account-request-${runId}`,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        messageId: intake.message.id,
        publicToken,
        target: { kind: "new_commerce_inquiry" },
      })
      const source = selected.message.request
      if (!source || source.kind !== "commerce_inquiry") {
        throw new Error("Commerce Inquiry source missing")
      }
      const inquiry = await fixture.db.commerceInquiry.findUniqueOrThrow({
        include: { lines: true },
        where: { id: source.id },
      })
      const sourceLineId = inquiry.lines[0]?.id
      if (!sourceLineId) throw new Error("Commerce Inquiry line missing")
      await transitionCommerceInquiry(fixture.db, {
        actorUserId: fixture.actorUserId,
        inquiryId: inquiry.id,
        reason: "Exact catalog item and availability confirmed",
        storeId: fixture.storeId,
        targetStatus: "READY_TO_QUOTE",
        tenantId: fixture.tenantId,
      })
      const quoteInput: Parameters<typeof issueCommerceInquiryQuote>[1] = {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `account-quote-${runId}`,
        clientVersionId: `account-version-${runId}`,
        inquiryId: inquiry.id,
        options: [
          {
            availabilityOutcome: "full",
            clientOptionId: `account-option-${runId}`,
            label: "Available item",
            lines: [
              {
                offeringId: fixture.offeringId,
                outcome: "included",
                quantity: "1",
                sourceLineId,
                unitPriceMinor: 2_650,
              },
            ],
          },
        ],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      await issueCommerceInquiryQuote(fixture.db, quoteInput)
      await issueCommerceInquiryQuote(fixture.db, quoteInput)

      const firstTimeline = await getGuestStoreConversationTimeline(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        },
        undefined,
        { issueCapabilityToken: issueActionToken },
      )
      const quoteMessage = firstTimeline.messages.find(
        (message) => message.actionMessage?.kind === "quote",
      )
      const invitationMessage = firstTimeline.messages.find(
        (message) => message.accountInvitation,
      )
      if (!quoteMessage || !invitationMessage?.accountInvitation) {
        throw new Error("Quote and account invitation messages are required")
      }
      expect(invitationMessage.sequence).toBe(quoteMessage.sequence + 1)
      expect(invitationMessage.accountInvitation).toMatchObject({
        actions: ["sign_up", "sign_in", "dismiss"],
        state: "offered",
      })
      expect(
        await fixture.db.storeConversationAccountInvitation.count({
          where: {
            conversationId: web.conversation.id,
            milestone: "FIRST_RELEASED_QUOTE",
          },
        }),
      ).toBe(1)

      const dismissInput = {
        clientOperationId: `account-dismiss-${runId}`,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        invitationId: invitationMessage.accountInvitation.id,
        messageId: invitationMessage.id,
        publicToken,
      }
      expect(
        await dismissGuestStoreConversationAccountInvitation(
          fixture.db,
          dismissInput,
        ),
      ).toMatchObject({ replayed: false })
      expect(
        await dismissGuestStoreConversationAccountInvitation(
          fixture.db,
          dismissInput,
        ),
      ).toMatchObject({ replayed: true })
      await expect(
        sendGuestStoreConversationText(fixture.db, {
          clientOperationId: `account-guest-continues-${runId}`,
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
          requestIntent: "continue_current",
          text: "I will continue here for now.",
        }),
      ).resolves.toMatchObject({
        message: { author: { kind: "customer", label: "You" } },
      })

      const account = await fixture.db.user.create({
        data: {
          email: `customer-account-${runId}@example.invalid`,
          emailVerified: true,
          name: "Acceptance Customer",
        },
      })
      fixture.cleanupUserIds.push(account.id)
      const otherAccount = await fixture.db.user.create({
        data: {
          email: `other-customer-account-${runId}@example.invalid`,
          emailVerified: true,
          name: "Other Acceptance Customer",
        },
      })
      fixture.cleanupUserIds.push(otherAccount.id)

      const candidates = await listGuestStoreConversationAccountCandidates(
        fixture.db,
        {
          accountUserId: account.id,
          credentialToken: web.credentialToken,
        },
      )
      expect(candidates.items).toEqual([
        expect.objectContaining({
          conversationId: web.conversation.id,
          invitationState: "dismissed",
          linked: false,
          storeName: "Acceptance Pharmacy",
        }),
      ])
      expect(JSON.stringify(candidates)).not.toMatch(
        /email|phone|tokenDigest|credentialToken/i,
      )

      const linkInput = {
        accountUserId: account.id,
        clientOperationId: `account-link-${runId}`,
        confirmed: true as const,
        conversationIds: [web.conversation.id],
        credentialToken: web.credentialToken,
      }
      const linked = await Promise.all([
        linkGuestStoreConversationsToAccount(fixture.db, linkInput),
        linkGuestStoreConversationsToAccount(fixture.db, linkInput),
      ])
      expect(linked.map((result) => result.replayed).sort()).toEqual([
        false,
        true,
      ])
      expect(
        await fixture.db.storeConversationAccountAccess.count({
          where: {
            accountUserId: account.id,
            conversationId: web.conversation.id,
          },
        }),
      ).toBe(1)

      await expect(
        linkGuestStoreConversationsToAccount(fixture.db, {
          ...linkInput,
          accountUserId: otherAccount.id,
          clientOperationId: `account-link-conflict-${runId}`,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(
        await fixture.db.storeConversationAccountAccess.count({
          where: { conversationId: web.conversation.id },
        }),
      ).toBe(1)

      const accountList = await listStoreConversationAccountConversations(
        fixture.db,
        { accountUserId: account.id },
      )
      expect(accountList.items).toEqual([
        expect.objectContaining({
          conversationId: web.conversation.id,
          publicToken,
        }),
      ])
      await expect(
        getAccountStoreConversationTimeline(
          fixture.db,
          {
            accountUserId: account.id,
            conversationId: web.conversation.id,
            publicToken,
          },
          { issueCapabilityToken: issueActionToken },
        ),
      ).resolves.toMatchObject({
        conversation: { id: web.conversation.id },
      })
      await expect(
        sendAccountStoreConversationText(fixture.db, {
          accountUserId: account.id,
          channel: "mobile",
          clientOperationId: `account-mobile-send-${runId}`,
          conversationId: web.conversation.id,
          publicToken,
          requestIntent: "continue_current",
          text: "This message came from my signed-in app.",
        }),
      ).resolves.toMatchObject({ message: { channel: "mobile" } })

      const transferToken = `account-transfer-${randomUUID()}`
      await createWebStoreConversationTransfer(fixture.db, {
        clientOperationId: `account-transfer-create-${runId}`,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        publicToken,
        transferToken,
      })
      const installationToken = `account-install-${randomUUID()}`
      const mobileCredentialToken = `account-mobile-${randomUUID()}-${randomUUID()}`
      await claimMobileStoreConversationTransfer(fixture.db, {
        installationToken,
        publicToken,
        transferToken,
      })
      const mobile = await redeemMobileStoreConversationTransfer(fixture.db, {
        installationToken,
        publicToken,
        targetCredentialToken: mobileCredentialToken,
        transferToken,
      })
      expect(mobile.conversation.id).toBe(web.conversation.id)

      const devices = await listStoreConversationAccountDevices(fixture.db, {
        accountUserId: account.id,
        currentGuest: {
          credentialToken: mobileCredentialToken,
          installationToken,
          purpose: "MOBILE_DEVICE",
        },
      })
      const mobileDevice = devices.find(
        (device) => device.current && device.purpose === "mobile",
      )
      if (!mobileDevice) throw new Error("Linked mobile device missing")
      expect(devices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ purpose: "web", status: "active" }),
          expect.objectContaining({ purpose: "mobile", status: "active" }),
        ]),
      )

      const revokeInput = {
        accountUserId: account.id,
        clientOperationId: `account-device-revoke-${runId}`,
        confirmed: true as const,
        deviceId: mobileDevice.deviceId,
      }
      expect(
        await revokeStoreConversationAccountDevice(fixture.db, revokeInput),
      ).toEqual({ deviceId: mobileDevice.deviceId, replayed: false })
      expect(
        await revokeStoreConversationAccountDevice(fixture.db, revokeInput),
      ).toEqual({ deviceId: mobileDevice.deviceId, replayed: true })
      await expect(
        getMobileStoreConversationTimeline(fixture.db, {
          conversationId: web.conversation.id,
          credentialToken: mobileCredentialToken,
          installationToken,
          publicToken,
        }),
      ).rejects.toMatchObject({ code: "GUEST_CREDENTIAL_EXPIRED" })
      await expect(
        getGuestStoreConversationTimeline(fixture.db, {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        }, undefined, { issueCapabilityToken: issueActionToken }),
      ).resolves.toMatchObject({
        conversation: { id: web.conversation.id },
      })
      await expect(
        getAccountStoreConversationTimeline(fixture.db, {
          accountUserId: account.id,
          conversationId: web.conversation.id,
          publicToken,
        }, { issueCapabilityToken: issueActionToken }),
      ).resolves.toMatchObject({
        conversation: { id: web.conversation.id },
      })

      const audits =
        await fixture.db.storeConversationAccountAuditEvent.findMany({
          orderBy: { occurredAt: "asc" },
          where: {
            OR: [
              { actorAccountUserId: account.id },
              { actorAccountUserId: otherAccount.id },
            ],
          },
        })
      expect(audits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actorAccountUserId: account.id,
            outcome: "ALLOWED",
            purpose: "ACCOUNT_ADOPTION",
            type: "ACCOUNT_LINKED",
          }),
          expect.objectContaining({
            actorAccountUserId: otherAccount.id,
            outcome: "DENIED",
            type: "ACCOUNT_LINK_DENIED",
          }),
          expect.objectContaining({
            actorAccountUserId: account.id,
            credentialId: mobileDevice.deviceId,
            outcome: "ALLOWED",
            purpose: "DEVICE_SECURITY",
            type: "DEVICE_REVOKED",
          }),
        ]),
      )
      expect(JSON.stringify(audits)).not.toMatch(
        /messageBody|media|email|phone|tokenDigest|credentialToken|provider/i,
      )
      expect(
        await fixture.db.customer.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(tenantCustomersBefore)
    }, 300_000)
  },
)
