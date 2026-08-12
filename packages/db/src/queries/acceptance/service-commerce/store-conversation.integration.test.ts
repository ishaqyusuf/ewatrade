import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import { publishCustomerEntryPoint } from "../../customer-channels"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  bootstrapWebStoreConversation,
  claimStoreConversation,
  getGuestStoreConversationTimeline,
  getStoreConversationStaffTimeline,
  listStoreConversationQueue,
  replyToStoreConversation,
  sendGuestStoreConversationText,
} from "../../store-conversations"
import { describeWithServiceCommerceDatabase } from "./database"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

setDefaultTimeout(240_000)

const conversationSettings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
    booking: false,
    delivery: false,
    intake: true,
    payment: false,
    pickup: false,
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

async function activateConversationProfile(
  fixture: ServiceCommerceAcceptanceFixture,
) {
  const configured = await updateServiceCommerceStoreProfile(fixture.db, {
    actorUserId: fixture.actorUserId,
    expectedRevision: 0,
    reason: "Configure anonymous Store Conversation acceptance",
    settings: conversationSettings,
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
  await setServiceCommerceStoreProfileActivation(fixture.db, {
    active: true,
    actorUserId: fixture.actorUserId,
    expectedRevision: configured.revision,
    reason: "Activate anonymous Store Conversation acceptance",
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
}

describeWithServiceCommerceDatabase(
  "Store Conversation anonymous text loop",
  () => {
    let primary: ServiceCommerceAcceptanceFixture
    let foreign: ServiceCommerceAcceptanceFixture
    let primaryEntryToken: string
    let foreignEntryToken: string

    beforeAll(async () => {
      primary = await createServiceCommerceAcceptanceFixture()
      foreign = await createServiceCommerceAcceptanceFixture()
      await activateConversationProfile(primary)
      await activateConversationProfile(foreign)
      const primaryEntry = await publishCustomerEntryPoint(primary.db, {
        actorUserId: primary.actorUserId,
        storeId: primary.storeId,
        tenantId: primary.tenantId,
      })
      const foreignEntry = await publishCustomerEntryPoint(foreign.db, {
        actorUserId: foreign.actorUserId,
        storeId: foreign.storeId,
        tenantId: foreign.tenantId,
      })
      primaryEntryToken = primaryEntry.publicToken
      foreignEntryToken = foreignEntry.publicToken
    })

    afterAll(async () => {
      const errors: unknown[] = []
      for (const fixture of [foreign, primary]) {
        if (!fixture) continue
        try {
          await disposeServiceCommerceAcceptanceFixture(fixture)
        } catch (error) {
          errors.push(error)
        }
      }
      if (errors.length > 0) throw new AggregateError(errors)
    })

    test("persists one guest request, guarded claim/reply, safe reload and exact isolation", async () => {
      const opened = await bootstrapWebStoreConversation(primary.db, {
        publicToken: primaryEntryToken,
      })
      expect(opened.credentialToken).toBeString()
      const credentialToken = opened.credentialToken as string
      const sendInput = {
        clientOperationId: "acceptance-guest-message-0001",
        conversationId: opened.conversation.id,
        credentialToken,
        publicToken: primaryEntryToken,
        text: "I need a small red bag",
      }

      const attempts = await Promise.all([
        sendGuestStoreConversationText(primary.db, sendInput),
        sendGuestStoreConversationText(primary.db, sendInput),
      ])
      const sent = attempts.find((attempt) => !attempt.replayed)
      const replay = attempts.find((attempt) => attempt.replayed)
      expect(attempts.map((attempt) => attempt.replayed).sort()).toEqual([
        false,
        true,
      ])
      expect(sent).toBeDefined()
      expect(replay).toBeDefined()
      if (!sent || !replay)
        throw new Error("Concurrent replay did not converge")
      expect(replay).toMatchObject({
        message: { id: sent.message.id },
        replayed: true,
        source: sent.source,
      })
      expect(
        await primary.db.storeConversationMessage.count({
          where: { conversationId: opened.conversation.id },
        }),
      ).toBe(1)
      expect(
        await primary.db.commerceInquiry.count({
          where: { id: sent.source?.id, tenantId: primary.tenantId },
        }),
      ).toBe(1)

      const queue = await listStoreConversationQueue(primary.db, {
        actorUserId: primary.actorUserId,
        storeId: primary.storeId,
        tenantId: primary.tenantId,
      })
      expect(queue).toEqual([
        expect.objectContaining({
          conversationId: opened.conversation.id,
          requestKinds: ["commerce_inquiry"],
          state: "new",
        }),
      ])
      expect(JSON.stringify(queue)).not.toContain(sendInput.text)

      await claimStoreConversation(primary.db, {
        actorUserId: primary.actorUserId,
        clientOperationId: "acceptance-claim-0001",
        conversationId: opened.conversation.id,
        storeId: primary.storeId,
        tenantId: primary.tenantId,
      })
      const reply = await replyToStoreConversation(primary.db, {
        actorUserId: primary.actorUserId,
        clientOperationId: "acceptance-reply-0001",
        conversationId: opened.conversation.id,
        storeId: primary.storeId,
        tenantId: primary.tenantId,
        text: "We have that bag. I am preparing your quotation.",
      })
      expect(reply).toMatchObject({
        message: {
          author: { kind: "store_attendant" },
          channel: "web",
          sequence: 2,
        },
        replayed: false,
      })

      const customerTimeline = await getGuestStoreConversationTimeline(
        primary.db,
        {
          conversationId: opened.conversation.id,
          credentialToken,
        },
      )
      const staffTimeline = await getStoreConversationStaffTimeline(
        primary.db,
        {
          actorUserId: primary.actorUserId,
          conversationId: opened.conversation.id,
          storeId: primary.storeId,
          tenantId: primary.tenantId,
        },
      )
      expect(customerTimeline.messages).toHaveLength(2)
      expect(customerTimeline.messages).toEqual(staffTimeline.messages)
      expect(JSON.stringify(customerTimeline)).not.toContain(credentialToken)

      await expect(
        sendGuestStoreConversationText(primary.db, {
          ...sendInput,
          clientOperationId: "acceptance-cross-store-0001",
          publicToken: foreignEntryToken,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      expect(
        await foreign.db.storeConversationMessage.count({
          where: { tenantId: foreign.tenantId },
        }),
      ).toBe(0)
    }, 240_000)
  },
)
