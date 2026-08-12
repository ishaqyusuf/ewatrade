import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import { publishCustomerEntryPoint } from "../../customer-channels"
import { submitPublicPrescriptionRequest } from "../../prescription-requests"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  createServiceRequestForm,
  submitPublicServiceRequest,
} from "../../service-public"
import {
  attachStoreConversationTypedRequest,
  bootstrapWebStoreConversation,
  claimStoreConversation,
  getGuestStoreConversationTimeline,
  getStoreConversationStaffTimeline,
  listStoreConversationQueue,
  replyToStoreConversation,
  selectGuestStoreConversationRequest,
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
        source: null,
      })
      const selected = await selectGuestStoreConversationRequest(primary.db, {
        clientOperationId: "acceptance-select-product-0001",
        conversationId: opened.conversation.id,
        credentialToken,
        messageId: sent.message.id,
        publicToken: primaryEntryToken,
        target: { kind: "new_commerce_inquiry" },
      })
      expect(selected).toMatchObject({
        message: {
          request: { kind: "commerce_inquiry" },
        },
        replayed: false,
      })
      expect(
        await primary.db.storeConversationMessage.count({
          where: { conversationId: opened.conversation.id },
        }),
      ).toBe(1)
      expect(
        await primary.db.commerceInquiry.count({
          where: {
            id: selected.message.request?.id,
            tenantId: primary.tenantId,
          },
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
          publicToken: primaryEntryToken,
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

    test("keeps Product, Service and Prescription Requests distinct in one conversation", async () => {
      const serviceForm = await createServiceRequestForm(primary.db, {
        actorUserId: primary.actorUserId,
        label: "Conversation Service Request",
        offeringIds: [primary.serviceOfferingId],
        storeId: primary.storeId,
        tenantId: primary.tenantId,
      })
      const opened = await bootstrapWebStoreConversation(primary.db, {
        publicToken: primaryEntryToken,
      })
      const credentialToken = opened.credentialToken
      if (!credentialToken) throw new Error("Guest credential was not issued")

      const productMessage = await sendGuestStoreConversationText(primary.db, {
        clientOperationId: "typed-product-message-0001",
        conversationId: opened.conversation.id,
        credentialToken,
        publicToken: primaryEntryToken,
        text: "I need a black travel bag",
      })
      expect(productMessage.source).toBeNull()
      const product = await selectGuestStoreConversationRequest(primary.db, {
        clientOperationId: "typed-product-select-0001",
        conversationId: opened.conversation.id,
        credentialToken,
        messageId: productMessage.message.id,
        publicToken: primaryEntryToken,
        target: { kind: "new_commerce_inquiry" },
      })

      const serviceMessage = await sendGuestStoreConversationText(primary.db, {
        clientOperationId: "typed-service-message-0001",
        conversationId: opened.conversation.id,
        credentialToken,
        publicToken: primaryEntryToken,
        requestIntent: "choose_request",
        text: "I also need a consultation",
      })
      expect(serviceMessage.source).toBeNull()
      const service = await submitPublicServiceRequest(primary.db, {
        clientRequestId: "typed-service-request-0001",
        customerEmail: "conversation-service@example.invalid",
        customerName: "Conversation Customer",
        expectedScope: {
          storeId: primary.storeId,
          tenantId: primary.tenantId,
        },
        formId: serviceForm.form.id,
        lines: [{ offeringId: primary.serviceOfferingId, quantity: "1" }],
      })
      await attachStoreConversationTypedRequest(primary.db, {
        clientOperationId: "typed-service-attach-0001",
        conversationId: opened.conversation.id,
        credentialToken,
        expectedSourceRevision: service.revision,
        messageId: serviceMessage.message.id,
        publicToken: primaryEntryToken,
        sourceId: service.id,
        sourceKind: "SERVICE_REQUEST",
      })

      const prescriptionMessage = await sendGuestStoreConversationText(
        primary.db,
        {
          clientOperationId: "typed-prescription-message-0001",
          conversationId: opened.conversation.id,
          credentialToken,
          publicToken: primaryEntryToken,
          requestIntent: "choose_request",
          text: "I need a pharmacist to review my prescription",
        },
      )
      expect(prescriptionMessage.source).toBeNull()
      const prescription = await submitPublicPrescriptionRequest(primary.db, {
        clientRequestId: "typed-prescription-request-0001",
        consentAcceptedAt: new Date(),
        consentVersion: "acceptance-v1",
        customerEmail: "conversation-prescription@example.invalid",
        customerName: "Conversation Customer",
        fulfilmentPreference: "pickup",
        media: [
          {
            clientMediaId: "typed-prescription-media-0001",
            mediaType: "image/jpeg",
            objectKey: `private/${primary.tenantId}/${primary.storeId}/conversation/page-1.jpg`,
            originalFileName: "safe-test-prescription.jpg",
            pageNumber: 1,
            sha256: "b".repeat(64),
            sizeBytes: 1_024,
          },
        ],
        publicToken: primary.publicToken,
      })
      await attachStoreConversationTypedRequest(primary.db, {
        clientOperationId: "typed-prescription-attach-0001",
        conversationId: opened.conversation.id,
        credentialToken,
        expectedSourceRevision: 1,
        messageId: prescriptionMessage.message.id,
        publicToken: primaryEntryToken,
        sourceId: prescription.requestId,
        sourceKind: "PRESCRIPTION_REQUEST",
      })

      const timeline = await getGuestStoreConversationTimeline(primary.db, {
        conversationId: opened.conversation.id,
        credentialToken,
        publicToken: primaryEntryToken,
      })
      expect(timeline.availableRequestKinds).toEqual([
        "product_inquiry",
        "service",
        "prescription",
      ])
      expect(timeline.requests).toEqual([
        expect.objectContaining({
          id: product.message.request?.id,
          kind: "commerce_inquiry",
          lifecycle: "active",
        }),
        expect.objectContaining({
          id: service.id,
          kind: "service_request",
          lifecycle: "active",
        }),
        expect.objectContaining({
          id: prescription.requestId,
          kind: "prescription_request",
          lifecycle: "active",
        }),
      ])
      expect(JSON.stringify(timeline)).not.toContain(
        "conversation-prescription@example.invalid",
      )
      expect(JSON.stringify(timeline)).not.toContain("objectKey")

      await claimStoreConversation(primary.db, {
        actorUserId: primary.actorUserId,
        clientOperationId: "typed-claim-0001",
        conversationId: opened.conversation.id,
        storeId: primary.storeId,
        tenantId: primary.tenantId,
      })
      await expect(
        replyToStoreConversation(primary.db, {
          actorUserId: primary.actorUserId,
          clientOperationId: "typed-ambiguous-reply-0001",
          conversationId: opened.conversation.id,
          storeId: primary.storeId,
          tenantId: primary.tenantId,
          text: "Your Request is under review.",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        replyToStoreConversation(primary.db, {
          actorUserId: primary.actorUserId,
          clientOperationId: "typed-prescription-reply-0001",
          conversationId: opened.conversation.id,
          request: {
            id: prescription.requestId,
            kind: "prescription_request",
          },
          storeId: primary.storeId,
          tenantId: primary.tenantId,
          text: "A pharmacist is reviewing this prescription Request.",
        }),
      ).resolves.toMatchObject({
        message: {
          request: {
            id: prescription.requestId,
            kind: "prescription_request",
          },
        },
      })

      await primary.db.serviceRequest.update({
        data: {
          revision: { increment: 1 },
          status: "NEEDS_INFORMATION",
        },
        where: { id: service.id },
      })
      const staleMessage = await sendGuestStoreConversationText(primary.db, {
        clientOperationId: "typed-stale-message-0001",
        conversationId: opened.conversation.id,
        credentialToken,
        publicToken: primaryEntryToken,
        requestIntent: "choose_request",
        text: "More details for the service",
      })
      await expect(
        attachStoreConversationTypedRequest(primary.db, {
          clientOperationId: "typed-stale-attach-0001",
          conversationId: opened.conversation.id,
          credentialToken,
          expectedSourceRevision: service.revision,
          messageId: staleMessage.message.id,
          publicToken: primaryEntryToken,
          sourceId: service.id,
          sourceKind: "SERVICE_REQUEST",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })

      await primary.db.serviceRequest.update({
        data: { revision: { increment: 1 }, status: "CONVERTED" },
        where: { id: service.id },
      })
      const afterCompletion = await getGuestStoreConversationTimeline(
        primary.db,
        {
          conversationId: opened.conversation.id,
          credentialToken,
          publicToken: primaryEntryToken,
        },
      )
      expect(afterCompletion.conversation.state).toBe("active")
      expect(afterCompletion.requests).toContainEqual(
        expect.objectContaining({
          id: service.id,
          lifecycle: "terminal",
          status: "converted",
        }),
      )
      await expect(
        attachStoreConversationTypedRequest(primary.db, {
          clientOperationId: "typed-cross-store-attach-0001",
          conversationId: opened.conversation.id,
          credentialToken,
          expectedSourceRevision: 1,
          messageId: productMessage.message.id,
          publicToken: foreignEntryToken,
          sourceId: service.id,
          sourceKind: "SERVICE_REQUEST",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
    }, 240_000)
  },
)
