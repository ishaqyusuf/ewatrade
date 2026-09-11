import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  HostedPaymentStatus,
  PaymentStatus,
  ServiceBookingPolicy,
} from "../../../../generated/prisma/enums"
import {
  acceptCommerceInquiryQuote,
  issueCommerceInquiryQuote,
  transitionCommerceInquiry,
} from "../../commerce-inquiries"
import { publishCustomerEntryPoint } from "../../customer-channels"
import {
  attachPrescriptionHostedCheckout,
  claimPrescriptionHostedCheckoutInitialization,
  preparePrescriptionHostedCheckout,
  processPrescriptionPaymentProviderEvent,
} from "../../prescription-payments"
import {
  acceptPrescriptionPickupQuote,
  issuePrescriptionQuote,
} from "../../prescription-requests"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  confirmServiceCommerceBooking,
  createServiceCommerceBookingHold,
  createServiceCommerceBookingResource,
  getPublicServiceCommerceBookingSlots,
  reviseServiceCommerceBooking,
  updateServiceCommerceBookingConfiguration,
} from "../../service-commerce-bookings"
import {
  acceptServiceQuote,
  createServiceRequestForm,
  issueServiceQuote,
  submitPublicServiceRequest,
} from "../../service-public"
import {
  attachStoreConversationTypedRequest,
  bootstrapWebStoreConversation,
  executeGuestStoreConversationActionMessage,
  getGuestStoreConversationMessagesAfter,
  getGuestStoreConversationTimeline,
  previewGuestStoreConversationActionMessage,
  selectGuestStoreConversationRequest,
  sendGuestStoreConversationText,
} from "../../store-conversations"
import { describeWithServiceCommerceDatabase } from "./database"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"
import { prepareReleasedPrescriptionQuote } from "./prescription-lifecycle"

setDefaultTimeout(300_000)

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
    booking: true,
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

function issueBookingToken(input: {
  clientOperationId: string
  purpose: "confirm" | "view_and_manage" | "view_slots"
  storeId: string
  tenantId: string
}) {
  return `conversation-booking-${input.purpose}-${input.clientOperationId}-${input.storeId}-${input.tenantId}`
}

async function linkExistingRequest(
  fixture: ServiceCommerceAcceptanceFixture,
  input: {
    publicToken: string
    request: {
      id: string
      kind: "PRESCRIPTION_REQUEST" | "SERVICE_REQUEST"
      revision: number
    }
    runId: string
  },
) {
  const web = await bootstrapWebStoreConversation(fixture.db, {
    publicToken: input.publicToken,
  })
  if (!web.credentialToken) throw new Error("Web credential missing")
  const message = await sendGuestStoreConversationText(fixture.db, {
    clientOperationId: `conversation-action-link-message-${input.runId}`,
    conversationId: web.conversation.id,
    credentialToken: web.credentialToken,
    publicToken: input.publicToken,
    requestIntent: "choose_request",
    text: "Please keep this Request in my conversation.",
  })
  await attachStoreConversationTypedRequest(fixture.db, {
    clientOperationId: `conversation-action-link-${input.runId}`,
    conversationId: web.conversation.id,
    credentialToken: web.credentialToken,
    expectedSourceRevision: input.request.revision,
    messageId: message.message.id,
    publicToken: input.publicToken,
    sourceId: input.request.id,
    sourceKind: input.request.kind,
  })
  return web
}

describeWithServiceCommerceDatabase(
  "Store Conversation Quote action messages",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture
    let publicToken: string

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const configured = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Configure Store Conversation Quote action acceptance",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: configured.revision,
        reason: "Activate Store Conversation Quote action acceptance",
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

    test("selects one Quote option and accepts one exact Order through a conversation-bound handoff", async () => {
      const runId = randomUUID()
      const web = await bootstrapWebStoreConversation(fixture.db, {
        publicToken,
      })
      if (!web.credentialToken) throw new Error("Web credential missing")
      const customerMessage = await sendGuestStoreConversationText(fixture.db, {
        clientOperationId: `conversation-action-message-${runId}`,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        publicToken,
        requestIntent: "choose_request",
        text: "Please quote two alternatives for this item.",
      })
      const selectedRequest = await selectGuestStoreConversationRequest(
        fixture.db,
        {
          clientOperationId: `conversation-action-request-${runId}`,
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          messageId: customerMessage.message.id,
          publicToken,
          target: { kind: "new_commerce_inquiry" },
        },
      )
      const request = selectedRequest.message.request
      if (!request || request.kind !== "commerce_inquiry") {
        throw new Error("Commerce Inquiry source missing")
      }
      const inquiry = await fixture.db.commerceInquiry.findUniqueOrThrow({
        include: { lines: true },
        where: { id: request.id },
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
        clientQuoteId: `conversation-action-quote-${runId}`,
        clientVersionId: `conversation-action-version-${runId}`,
        inquiryId: inquiry.id,
        options: [
          {
            availabilityOutcome: "full",
            clientOptionId: `standard-${runId}`,
            label: "Standard",
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
          {
            availabilityOutcome: "full",
            clientOptionId: `express-${runId}`,
            label: "Express",
            lines: [
              {
                offeringId: fixture.offeringId,
                outcome: "included",
                quantity: "1",
                sourceLineId,
                unitPriceMinor: 3_100,
              },
            ],
          },
        ],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      }
      expect(
        await fixture.db.storeConversationActionMessage.count({
          where: { conversationId: web.conversation.id },
        }),
      ).toBe(0)
      const issued = await issueCommerceInquiryQuote(fixture.db, quoteInput)
      await issueCommerceInquiryQuote(fixture.db, quoteInput)
      expect(
        await fixture.db.storeConversationActionMessage.count({
          where: { conversationId: web.conversation.id },
        }),
      ).toBe(1)

      const timeline = await getGuestStoreConversationTimeline(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        },
        undefined,
        { issueCapabilityToken: issueActionToken },
      )
      const message = timeline.messages.find(
        (item) => item.actionMessage?.kind === "quote",
      )
      if (!message?.actionMessage) throw new Error("Quote message missing")
      expect(message.actionMessage).toMatchObject({
        actions: expect.arrayContaining([
          expect.objectContaining({ action: "choose_quote_option" }),
        ]),
        lifecycle: "current",
        options: [
          { label: "Standard", selected: false, totalMinor: 2_650 },
          { label: "Express", selected: false, totalMinor: 3_100 },
        ],
      })
      const recovered = await getGuestStoreConversationMessagesAfter(
        fixture.db,
        {
          afterSequence: message.sequence - 1,
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        },
        undefined,
        { issueCapabilityToken: issueActionToken },
      )
      expect(recovered.messages[0]?.actionMessage?.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: "choose_quote_option" }),
        ]),
      )

      const preview = await previewGuestStoreConversationActionMessage(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          messageId: message.id,
          publicToken,
        },
        { issueCapabilityToken: issueActionToken },
      )
      const chooseExpress = preview.actions.find(
        (action) =>
          action.action === "choose_quote_option" &&
          action.amountMinor === 3_100,
      )
      if (!chooseExpress) throw new Error("Express selection action missing")
      const selectionInput = {
        capabilityToken: chooseExpress.capabilityToken,
        clientOperationId: `conversation-action-select-${runId}`,
        confirmed: true,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        messageId: message.id,
        publicToken,
      }
      const convergedSelection = await Promise.all([
        executeGuestStoreConversationActionMessage(fixture.db, selectionInput),
        executeGuestStoreConversationActionMessage(fixture.db, selectionInput),
      ])
      expect(
        convergedSelection.map((result) => result.replayed).sort(),
      ).toEqual([false, true])
      await expect(
        executeGuestStoreConversationActionMessage(fixture.db, {
          ...selectionInput,
          confirmed: false,
        }),
      ).rejects.toMatchObject({ code: "ACTION_IDEMPOTENCY_MISMATCH" })

      const selectedPreview = await previewGuestStoreConversationActionMessage(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          messageId: message.id,
          publicToken,
        },
        { issueCapabilityToken: issueActionToken },
      )
      expect(selectedPreview.options).toContainEqual(
        expect.objectContaining({ label: "Express", selected: true }),
      )
      const viewQuote = selectedPreview.actions.find(
        (action) => action.action === "view_quote",
      )
      if (!viewQuote) throw new Error("Quote handoff action missing")
      await executeGuestStoreConversationActionMessage(fixture.db, {
        capabilityToken: viewQuote.capabilityToken,
        clientOperationId: `conversation-action-view-${runId}`,
        confirmed: false,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        messageId: message.id,
        publicToken,
      })
      const accepted = await acceptCommerceInquiryQuote(fixture.db, {
        acceptanceToken: viewQuote.capabilityToken,
        clientAcceptanceId: `conversation-action-accept-${runId}`,
      })
      await expect(
        acceptCommerceInquiryQuote(fixture.db, {
          acceptanceToken: viewQuote.capabilityToken,
          clientAcceptanceId: `conversation-action-accept-${runId}`,
        }),
      ).resolves.toEqual(accepted)
      expect(
        await fixture.db.commercialOrder.count({
          where: {
            id: accepted.orderId,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        }),
      ).toBe(1)

      const completed = await previewGuestStoreConversationActionMessage(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          messageId: message.id,
          publicToken,
        },
        { issueCapabilityToken: issueActionToken },
      )
      expect(completed).toMatchObject({
        lifecycle: "completed",
        options: [
          { label: "Standard", selected: false },
          { label: "Express", selected: true },
        ],
      })
      expect(completed.actions.map((action) => action.action)).toEqual([
        "view_quote",
        "talk_to_staff",
      ])

      const executionsBeforeStaleAttempts =
        await fixture.db.serviceCommerceCustomerActionExecution.count({
          where: { tenantId: fixture.tenantId },
        })
      const [expiringView, revokingSupport] = completed.actions
      if (!expiringView || !revokingSupport) {
        throw new Error("Expected completed Quote recovery actions")
      }
      await fixture.db.serviceCommerceCustomerActionCapability.update({
        data: { expiresAt: new Date(Date.now() - 1_000) },
        where: {
          tokenDigest: createHash("sha256")
            .update(expiringView.capabilityToken)
            .digest("hex"),
        },
      })
      await fixture.db.serviceCommerceCustomerActionCapability.update({
        data: { status: "REVOKED" },
        where: {
          tokenDigest: createHash("sha256")
            .update(revokingSupport.capabilityToken)
            .digest("hex"),
        },
      })
      await expect(
        executeGuestStoreConversationActionMessage(fixture.db, {
          capabilityToken: expiringView.capabilityToken,
          clientOperationId: `conversation-action-expired-${runId}`,
          confirmed: false,
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          messageId: message.id,
          publicToken,
        }),
      ).rejects.toBeInstanceOf(Error)
      await expect(
        executeGuestStoreConversationActionMessage(fixture.db, {
          capabilityToken: revokingSupport.capabilityToken,
          clientOperationId: `conversation-action-revoked-${runId}`,
          confirmed: false,
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          messageId: message.id,
          publicToken,
        }),
      ).rejects.toBeInstanceOf(Error)
      expect(
        await fixture.db.serviceCommerceCustomerActionExecution.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(executionsBeforeStaleAttempts)

      const foreignConversation = await bootstrapWebStoreConversation(
        fixture.db,
        { publicToken },
      )
      if (!foreignConversation.credentialToken) {
        throw new Error("Foreign web credential missing")
      }
      const executionsBefore =
        await fixture.db.serviceCommerceCustomerActionExecution.count({
          where: { tenantId: fixture.tenantId },
        })
      await expect(
        executeGuestStoreConversationActionMessage(fixture.db, {
          capabilityToken: completed.actions[0]?.capabilityToken ?? "missing",
          clientOperationId: `conversation-action-cross-scope-${runId}`,
          confirmed: false,
          conversationId: foreignConversation.conversation.id,
          credentialToken: foreignConversation.credentialToken,
          messageId: message.id,
          publicToken,
        }),
      ).rejects.toBeInstanceOf(Error)
      expect(
        await fixture.db.serviceCommerceCustomerActionExecution.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(executionsBefore)

      expect(issued.versionId).toBeTruthy()
    }, 300_000)

    test("accepts one Service Order through the exact conversation Quote handoff", async () => {
      const runId = randomUUID()
      const now = new Date()
      const slotStartAt = new Date(now.getTime() + 3 * 86_400_000)
      slotStartAt.setUTCMinutes(0, 0, 0)
      slotStartAt.setUTCHours(10)
      const slotEndAt = new Date(slotStartAt.getTime() + 60 * 60_000)
      const rescheduledStartAt = new Date(
        slotStartAt.getTime() + 2 * 60 * 60_000,
      )
      const rescheduledEndAt = new Date(
        rescheduledStartAt.getTime() + 60 * 60_000,
      )
      await fixture.db.serviceOffering.update({
        data: { bookingPolicy: ServiceBookingPolicy.BOOKING_REQUIRED },
        where: { offeringId: fixture.serviceOfferingId },
      })
      const resource = await createServiceCommerceBookingResource(fixture.db, {
        actorUserId: fixture.actorUserId,
        capacity: 1,
        clientOperationId: `conversation-booking-resource-${runId}`,
        kind: "room",
        name: "Conversation Consultation Room",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const bookingConfiguration =
        await updateServiceCommerceBookingConfiguration(fixture.db, {
          actorUserId: fixture.actorUserId,
          availabilityRules: [
            {
              daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
              endLocalTime: "18:00",
              id: `conversation-booking-hours-${runId}`,
              startLocalTime: "08:00",
            },
          ],
          bookingHorizonMinutes: 43_200,
          cancellationPolicy: {
            allowedUntilMinutesBeforeStart: 60,
            refundPolicy: "none",
            revision: 1,
          },
          clientOperationId: `conversation-booking-config-${runId}`,
          exceptions: [],
          expectedRevision: 0,
          holdDurationMinutes: 5,
          leadTimeMinutes: 0,
          offeringId: fixture.serviceOfferingId,
          paymentPolicy: {
            depositMinor: null,
            requirement: "none",
            revision: 1,
          },
          reminderLeadMinutes: 1_440,
          resources: [{ capacity: 1, id: resource.id, label: resource.name }],
          slotDurationMinutes: 60,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
          timezone: "Africa/Lagos",
        })
      const form = await createServiceRequestForm(fixture.db, {
        actorUserId: fixture.actorUserId,
        label: `Conversation Service ${runId}`,
        offeringIds: [fixture.serviceOfferingId],
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const request = await submitPublicServiceRequest(fixture.db, {
        clientRequestId: `conversation-service-request-${runId}`,
        customerName: "Conversation Service Customer",
        details: "Please quote this appointment service.",
        formToken: form.token,
        lines: [{ offeringId: fixture.serviceOfferingId, quantity: "1" }],
      })
      const source = await fixture.db.serviceRequest.findUniqueOrThrow({
        select: { revision: true },
        where: { id: request.id },
      })
      const web = await linkExistingRequest(fixture, {
        publicToken,
        request: {
          id: request.id,
          kind: "SERVICE_REQUEST",
          revision: source.revision,
        },
        runId,
      })
      const issued = await issueServiceQuote(fixture.db, {
        actorUserId: fixture.actorUserId,
        clientQuoteId: `conversation-service-quote-${runId}`,
        clientVersionId: `conversation-service-version-${runId}`,
        lines: [
          {
            offeringId: fixture.serviceOfferingId,
            quantity: "1",
            unitPriceMinor: 7_500,
          },
        ],
        requestId: request.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(issued.token).toBeTruthy()
      const timeline = await getGuestStoreConversationTimeline(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken ?? "missing",
          publicToken,
        },
        undefined,
        { issueCapabilityToken: issueActionToken },
      )
      const message = timeline.messages.find((item) => item.actionMessage)
      if (!message) throw new Error("Service Quote message missing")
      const preview = await previewGuestStoreConversationActionMessage(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken ?? "missing",
          messageId: message.id,
          publicToken,
        },
        { issueCapabilityToken: issueActionToken },
      )
      const viewQuote = preview.actions.find(
        (action) => action.action === "view_quote",
      )
      if (!viewQuote) throw new Error("Service Quote handoff missing")
      await executeGuestStoreConversationActionMessage(fixture.db, {
        capabilityToken: viewQuote.capabilityToken,
        clientOperationId: `conversation-service-view-${runId}`,
        confirmed: false,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken ?? "missing",
        messageId: message.id,
        publicToken,
      })
      const accepted = await acceptServiceQuote(fixture.db, {
        acceptanceToken: viewQuote.capabilityToken,
        actorUserId: "public_store_conversation",
        clientAcceptanceId: `conversation-service-accept-${runId}`,
      })
      await expect(
        acceptServiceQuote(fixture.db, {
          acceptanceToken: viewQuote.capabilityToken,
          actorUserId: "public_store_conversation",
          clientAcceptanceId: `conversation-service-accept-${runId}`,
        }),
      ).resolves.toEqual(accepted)
      expect(
        await fixture.db.commercialOrder.count({
          where: {
            id: accepted.orderId,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        }),
      ).toBe(1)
      const completed = await previewGuestStoreConversationActionMessage(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken ?? "missing",
          messageId: message.id,
          publicToken,
        },
        { issueCapabilityToken: issueActionToken },
      )
      expect(completed.lifecycle).toBe("completed")
      const book = completed.actions.find((action) => action.action === "book")
      if (!book) throw new Error("Conversation booking action missing")
      await executeGuestStoreConversationActionMessage(fixture.db, {
        capabilityToken: book.capabilityToken,
        clientOperationId: `conversation-service-book-${runId}`,
        confirmed: true,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken ?? "missing",
        messageId: message.id,
        publicToken,
      })

      const slots = await getPublicServiceCommerceBookingSlots(fixture.db, {
        accessToken: book.capabilityToken,
        from: new Date(slotStartAt.getTime() - 60 * 60_000),
        now,
        to: new Date(slotEndAt.getTime() + 3 * 60 * 60_000),
      })
      expect(slots.configurationRevision).toBe(bookingConfiguration.revision)
      const selectedSlot = slots.slots.find(
        (slot) =>
          slot.resourceId === resource.id &&
          slot.startAt.getTime() === slotStartAt.getTime(),
      )
      if (!selectedSlot) throw new Error("Conversation booking slot missing")
      const hold = await createServiceCommerceBookingHold(fixture.db, {
        accessToken: book.capabilityToken,
        clientOperationId: `conversation-service-hold-${runId}`,
        expectedConfigurationRevision: bookingConfiguration.revision,
        issueCapabilityToken: issueBookingToken,
        now,
        offeringId: fixture.serviceOfferingId,
        quantity: 1,
        resourceId: resource.id,
        slotEndAt: selectedSlot.endAt,
        slotStartAt: selectedSlot.startAt,
        source: { id: request.id, kind: "service" },
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const confirmed = await confirmServiceCommerceBooking(fixture.db, {
        accessToken: hold.accessToken ?? "missing-hold-token",
        clientOperationId: `conversation-service-confirm-${runId}`,
        commercialOrderId: accepted.orderId,
        holdId: hold.id,
        issueCapabilityToken: issueBookingToken,
        now,
        protectRecipient: (value) => `protected:${value}`,
        quoteVersionId: issued.versionId,
        serviceJobId: accepted.jobId ?? undefined,
        source: { id: request.id, kind: "service" },
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await expect(
        confirmServiceCommerceBooking(fixture.db, {
          accessToken: hold.accessToken ?? "missing-hold-token",
          clientOperationId: `conversation-service-confirm-${runId}`,
          commercialOrderId: accepted.orderId,
          holdId: hold.id,
          issueCapabilityToken: issueBookingToken,
          now,
          protectRecipient: (value) => `protected:${value}`,
          quoteVersionId: issued.versionId,
          serviceJobId: accepted.jobId ?? undefined,
          source: { id: request.id, kind: "service" },
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ).resolves.toMatchObject({ id: confirmed.id })

      const manageable = await previewGuestStoreConversationActionMessage(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken ?? "missing",
          messageId: message.id,
          publicToken,
        },
        { issueCapabilityToken: issueActionToken },
      )
      const reschedule = manageable.actions.find(
        (action) => action.action === "reschedule",
      )
      if (!reschedule) throw new Error("Conversation reschedule action missing")
      await executeGuestStoreConversationActionMessage(fixture.db, {
        capabilityToken: reschedule.capabilityToken,
        clientOperationId: `conversation-service-reschedule-action-${runId}`,
        confirmed: true,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken ?? "missing",
        messageId: message.id,
        publicToken,
      })
      const rescheduled = await reviseServiceCommerceBooking(fixture.db, {
        accessToken: reschedule.capabilityToken,
        bookingId: confirmed.id,
        clientOperationId: `conversation-service-reschedule-${runId}`,
        expectedRevision: 0,
        issueCapabilityToken: issueBookingToken,
        newSlotEndAt: rescheduledEndAt,
        newSlotStartAt: rescheduledStartAt,
        now,
        operation: "reschedule",
        reasonCode: "customer_rescheduled_from_conversation",
        resourceId: resource.id,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(rescheduled).toMatchObject({ revision: 1, status: "confirmed" })
      await expect(
        reviseServiceCommerceBooking(fixture.db, {
          accessToken: reschedule.capabilityToken,
          bookingId: confirmed.id,
          clientOperationId: `conversation-service-stale-reschedule-${runId}`,
          expectedRevision: 0,
          issueCapabilityToken: issueBookingToken,
          newSlotEndAt: rescheduledEndAt,
          newSlotStartAt: rescheduledStartAt,
          now,
          operation: "reschedule",
          reasonCode: "stale_conversation_action",
          resourceId: resource.id,
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        }),
      ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" })

      const afterReschedule = await previewGuestStoreConversationActionMessage(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken ?? "missing",
          messageId: message.id,
          publicToken,
        },
        { issueCapabilityToken: issueActionToken },
      )
      const cancel = afterReschedule.actions.find(
        (action) => action.action === "cancel",
      )
      if (!cancel) throw new Error("Conversation cancellation action missing")
      await executeGuestStoreConversationActionMessage(fixture.db, {
        capabilityToken: cancel.capabilityToken,
        clientOperationId: `conversation-service-cancel-action-${runId}`,
        confirmed: true,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken ?? "missing",
        messageId: message.id,
        publicToken,
      })
      const cancelled = await reviseServiceCommerceBooking(fixture.db, {
        accessToken: cancel.capabilityToken,
        bookingId: confirmed.id,
        clientOperationId: `conversation-service-cancel-${runId}`,
        expectedRevision: 1,
        issueCapabilityToken: issueBookingToken,
        now,
        operation: "cancel",
        reasonCode: "customer_cancelled_from_conversation",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      expect(cancelled).toMatchObject({ revision: 2, status: "cancelled" })
      expect(
        await fixture.db.serviceBooking.count({
          where: {
            id: confirmed.id,
            sourceId: request.id,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        }),
      ).toBe(1)
    }, 480_000)

    test("keeps pharmacist release, pickup acceptance and hosted payment authoritative", async () => {
      const runId = randomUUID()
      let linkedConversation:
        | Awaited<ReturnType<typeof bootstrapWebStoreConversation>>
        | undefined
      const prepared = await prepareReleasedPrescriptionQuote(
        fixture,
        "web",
        "pickup",
        {
          beforePharmacistRelease: async ({
            currentMediaRevision,
            requestId,
            transcriptionLineId,
          }) => {
            const linked = await linkExistingRequest(fixture, {
              publicToken,
              request: {
                id: requestId,
                kind: "PRESCRIPTION_REQUEST",
                revision: currentMediaRevision,
              },
              runId,
            })
            linkedConversation = linked
            await expect(
              issuePrescriptionQuote(fixture.db, {
                actorUserId: fixture.actorUserId,
                availabilityOutcome: "full",
                clientQuoteId: `conversation-pre-release-quote-${runId}`,
                clientVersionId: `conversation-pre-release-version-${runId}`,
                lines: [{ transcriptionLineId, unitPriceMinor: 2_500 }],
                requestId,
                storeId: fixture.storeId,
                tenantId: fixture.tenantId,
              }),
            ).rejects.toMatchObject({ code: "REQUEST_CONFLICT" })
            expect(
              await fixture.db.storeConversationActionMessage.count({
                where: { conversationId: linked.conversation.id },
              }),
            ).toBe(0)
            expect(
              await fixture.db.serviceCommerceCustomerActionCapability.count({
                where: {
                  sourceId: requestId,
                  sourceKind: "PRESCRIPTION",
                  storeId: fixture.storeId,
                  tenantId: fixture.tenantId,
                },
              }),
            ).toBe(0)
          },
          beforeIssueQuote: async () => {
            const linked = linkedConversation
            if (!linked) {
              throw new Error("Prescription conversation was not linked")
            }
            expect(
              await fixture.db.storeConversationActionMessage.count({
                where: { conversationId: linked.conversation.id },
              }),
            ).toBe(0)
          },
        },
      )
      const web = linkedConversation
      if (!web?.credentialToken) {
        throw new Error("Prescription conversation was not linked")
      }
      const timeline = await getGuestStoreConversationTimeline(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        },
        undefined,
        { issueCapabilityToken: issueActionToken },
      )
      const message = timeline.messages.find((item) => item.actionMessage)
      if (!message) throw new Error("Prescription Quote message missing")
      const preview = await previewGuestStoreConversationActionMessage(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          messageId: message.id,
          publicToken,
        },
        { issueCapabilityToken: issueActionToken },
      )
      const pickup = preview.actions.find(
        (action) => action.action === "pick_up",
      )
      if (!pickup) {
        throw new Error(
          `Prescription pickup action missing: ${
            preview.actions.map((action) => action.action).join(",") || "none"
          }`,
        )
      }
      await executeGuestStoreConversationActionMessage(fixture.db, {
        capabilityToken: pickup.capabilityToken,
        clientOperationId: `conversation-prescription-pickup-${runId}`,
        confirmed: true,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        messageId: message.id,
        publicToken,
      })
      const accepted = await acceptPrescriptionPickupQuote(fixture.db, {
        acceptanceToken: pickup.capabilityToken,
        clientAcceptanceId: `conversation-prescription-accept-${runId}`,
        partialAcknowledged: false,
      })
      const completed = await previewGuestStoreConversationActionMessage(
        fixture.db,
        {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          messageId: message.id,
          publicToken,
        },
        { issueCapabilityToken: issueActionToken },
      )
      const payNow = completed.actions.find(
        (action) => action.action === "pay_now",
      )
      if (!payNow) throw new Error("Prescription payment action missing")
      await executeGuestStoreConversationActionMessage(fixture.db, {
        capabilityToken: payNow.capabilityToken,
        clientOperationId: `conversation-prescription-pay-${runId}`,
        confirmed: true,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        messageId: message.id,
        publicToken,
      })
      const checkout = await preparePrescriptionHostedCheckout(fixture.db, {
        acceptanceToken: payNow.capabilityToken,
        clientPaymentId: `conversation-prescription-payment-${runId}`,
        provider: "acceptance-fake",
        statusToken: `conversation-prescription-status-${runId}`,
      })
      const claims = await Promise.all([
        claimPrescriptionHostedCheckoutInitialization(fixture.db, {
          intentId: checkout.intentId,
          providerReference: checkout.providerReference,
        }),
        claimPrescriptionHostedCheckoutInitialization(fixture.db, {
          intentId: checkout.intentId,
          providerReference: checkout.providerReference,
        }),
      ])
      expect(claims.filter((claim) => claim.kind === "claimed")).toHaveLength(1)
      expect(
        claims.filter((claim) => claim.kind === "initializing"),
      ).toHaveLength(1)
      await attachPrescriptionHostedCheckout(fixture.db, {
        checkoutUrl: `https://payments.example.invalid/${checkout.intentId}`,
        intentId: checkout.intentId,
        providerReference: checkout.providerReference,
      })
      const [beforeCallbackOrder, pendingIntent] = await Promise.all([
        fixture.db.commercialOrder.findUniqueOrThrow({
          where: { id: accepted.orderId },
        }),
        fixture.db.prescriptionPaymentIntent.findUniqueOrThrow({
          where: { id: checkout.intentId },
        }),
      ])
      expect(beforeCallbackOrder.paymentStatus).toBe(PaymentStatus.PENDING)
      expect(pendingIntent.status).toBe(HostedPaymentStatus.PENDING)
      await processPrescriptionPaymentProviderEvent(fixture.db, {
        amountMinor: checkout.amountMinor,
        currencyCode: checkout.currencyCode,
        eventId: `conversation-prescription-provider-${runId}`,
        provider: "acceptance-fake",
        providerReference: checkout.providerReference,
        status: "paid",
      })
      const [order, pickupFulfilment] = await Promise.all([
        fixture.db.commercialOrder.findUniqueOrThrow({
          where: { id: accepted.orderId },
        }),
        fixture.db.prescriptionPickupFulfillment.findFirstOrThrow({
          where: { orderId: accepted.orderId },
        }),
      ])
      expect(order.paymentStatus).toBe(PaymentStatus.PAID)
      expect(pickupFulfilment.status).toBe("PREPARING")
      expect(JSON.stringify(completed)).not.toMatch(
        /providerReference|checkoutUrl|tenantId|storeId/i,
      )
    }, 360_000)
  },
)
