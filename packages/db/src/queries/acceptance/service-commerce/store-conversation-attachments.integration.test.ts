import { createHash, randomUUID } from "node:crypto"

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"

import {
  publishCustomerEntryPoint,
  resolveCustomerEntryPointIntakeContext,
} from "../../customer-channels"
import { submitServiceCommercePrescriptionRequest } from "../../prescription-requests"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import { recordServiceCommerceMediaIntake } from "../../service-commerce-attachments"
import {
  recordServiceCommerceMediaSafety,
  recordStoredServiceCommerceMediaAsset,
  requestServiceCommerceMediaSafety,
} from "../../service-commerce-media-assets"
import {
  appendGuestStoreConversationAttachment,
  authorizeGuestStoreConversationVoiceNoteView,
  bootstrapWebStoreConversation,
  commitGuestStoreConversationPrescriptionAttachment,
  getGuestStoreConversationTimeline,
  listPendingStoreConversationMediaSafetyWork,
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

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: true,
    booking: false,
    delivery: false,
    intake: true,
    payment: false,
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

describeWithServiceCommerceDatabase(
  "Store Conversation private attachments on Neon",
  () => {
    let fixture: ServiceCommerceAcceptanceFixture
    let publicToken: string

    beforeAll(async () => {
      fixture = await createServiceCommerceAcceptanceFixture()
      const configured = await updateServiceCommerceStoreProfile(fixture.db, {
        actorUserId: fixture.actorUserId,
        expectedRevision: 0,
        reason: "Configure Store Conversation attachment acceptance",
        settings,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await fixture.db.serviceCommerceStoreProfile.updateMany({
        data: { attachmentsProviderReady: true },
        where: { storeId: fixture.storeId, tenantId: fixture.tenantId },
      })
      await setServiceCommerceStoreProfileActivation(fixture.db, {
        active: true,
        actorUserId: fixture.actorUserId,
        expectedRevision: configured.revision,
        reason: "Activate Store Conversation attachment acceptance",
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
      if (fixture) await disposeServiceCommerceAcceptanceFixture(fixture)
    })

    test("proves exact generic and clinical owners with safe projections and bounded recovery", async () => {
      const runId = randomUUID()
      const genericConversation = await bootstrapWebStoreConversation(
        fixture.db,
        { publicToken },
      )
      if (!genericConversation.credentialToken) {
        throw new Error("Generic guest credential missing")
      }
      const staged = await sendGuestStoreConversationText(fixture.db, {
        clientOperationId: `generic-text-${runId}`,
        conversationId: genericConversation.conversation.id,
        credentialToken: genericConversation.credentialToken,
        publicToken,
        requestIntent: "choose_request",
        text: "Please identify the item in my image",
      })
      const selected = await selectGuestStoreConversationRequest(fixture.db, {
        clientOperationId: `generic-request-${runId}`,
        conversationId: genericConversation.conversation.id,
        credentialToken: genericConversation.credentialToken,
        messageId: staged.message.id,
        publicToken,
        target: { kind: "new_commerce_inquiry" },
      })
      const inquiryId = selected.message.request?.id
      if (!inquiryId) throw new Error("Generic Request was not linked")
      const line = await fixture.db.commerceInquiryLine.findFirstOrThrow({
        select: { id: true },
        where: { inquiryId },
      })
      const source = await fixture.db.commerceInquiryLine.findFirstOrThrow({
        select: {
          createdAt: true,
          description: true,
          position: true,
          requestedQuantity: true,
        },
        where: { id: line.id },
      })
      const sourceVersion = createHash("sha256")
        .update(
          JSON.stringify({
            description: source.description,
            position: source.position,
            quantity: source.requestedQuantity?.toString() ?? null,
          }),
        )
        .digest("hex")
      const generic = await recordServiceCommerceMediaIntake(fixture.db, {
        actorUserId: "public_store_conversation",
        channel: "web",
        clientMediaId: `generic-media-${runId}`,
        contentDigest: "a".repeat(64),
        fileName: "item.jpg",
        kind: "image",
        mimeType: "image/jpeg",
        privateMediaProviderReady: true,
        retentionUntil: new Date("2027-08-13T00:00:00.000Z"),
        signatureMimeType: "image/jpeg",
        sizeBytes: 4,
        source: { id: inquiryId, kind: "commerce_inquiry" },
        sourceLineId: line.id,
        sourceVersion,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await recordStoredServiceCommerceMediaAsset(fixture.db, {
        contentDigest: "a".repeat(64),
        mediaAssetId: generic.media.id,
        objectKey: `private/${runId}/generic`,
        reason: "Store Conversation attachment acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        verifiedMediaType: "image/jpeg",
        verifiedSizeBytes: 4,
      })
      await requestServiceCommerceMediaSafety(fixture.db, {
        mediaAssetId: generic.media.id,
        reason: "Store Conversation attachment acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const genericMessage = await appendGuestStoreConversationAttachment(
        fixture.db,
        {
          channel: "web",
          clientOperationId: `generic-attachment-${runId}`,
          conversationId: genericConversation.conversation.id,
          credentialToken: genericConversation.credentialToken,
          owner: {
            kind: "generic",
            sourceAttachmentId: generic.attachment.id,
          },
          publicToken,
          request: {
            id: inquiryId,
            kind: "commerce_inquiry",
            revision: 1,
          },
        },
      )
      expect(genericMessage.message.attachments[0]).toMatchObject({
        kind: "image",
        state: "pending",
      })

      const context = await resolveCustomerEntryPointIntakeContext(fixture.db, {
        publicToken,
      })
      const initialClinical = await submitServiceCommercePrescriptionRequest(
        fixture.db,
        {
          actorUserId: "public_store_conversation",
          channel: "web",
          clientRequestId: `clinical-request-${runId}`,
          consentAcceptedAt: new Date(),
          consentVersion: "acceptance-v1",
          fulfilmentPreference: "pickup",
          intakeContext: {
            entryPointId: context.id,
            entryPointRevision: context.revision,
            kind: "entry_point",
          },
          media: [
            {
              clientMediaId: `clinical-initial-${runId}`,
              mediaType: "application/pdf",
              objectKey: `private/${runId}/clinical-initial`,
              originalFileName: "prescription.pdf",
              pageNumber: 1,
              sha256: "b".repeat(64),
              sizeBytes: 8,
            },
          ],
          storeId: fixture.storeId,
          tenantId: fixture.tenantId,
        },
      )
      const clinicalConversation = await bootstrapWebStoreConversation(
        fixture.db,
        { publicToken },
      )
      if (!clinicalConversation.credentialToken) {
        throw new Error("Clinical guest credential missing")
      }
      const clinical = await commitGuestStoreConversationPrescriptionAttachment(
        fixture.db,
        {
          channel: "web",
          clientOperationId: `clinical-attachment-${runId}`,
          conversationId: clinicalConversation.conversation.id,
          credentialToken: clinicalConversation.credentialToken,
          expectedMediaRevision: 1,
          media: {
            clientMediaId: `clinical-follow-up-${runId}`,
            mediaType: "image/png",
            objectKey: `private/${runId}/clinical-follow-up`,
            originalFileName: "prescription-follow-up.png",
            pageNumber: 1,
            sha256: "c".repeat(64),
            sizeBytes: 8,
          },
          publicToken,
          requestId: initialClinical.requestId,
        },
      )
      expect(clinical.message).toMatchObject({
        attachments: [{ kind: "image", state: "pending" }],
        request: {
          id: initialClinical.requestId,
          kind: "prescription_request",
        },
      })
      expect(
        await fixture.db.storeConversationMessageAttachment.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(2)

      const recovery = await listPendingStoreConversationMediaSafetyWork(
        fixture.db,
        { limit: 20 },
      )
      expect(recovery.items).toEqual(
        expect.arrayContaining([
          {
            kind: "generic",
            mediaAssetId: generic.media.id,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
          {
            kind: "prescription",
            requestId: initialClinical.requestId,
            storeId: fixture.storeId,
            tenantId: fixture.tenantId,
          },
        ]),
      )
      await recordServiceCommerceMediaSafety(fixture.db, {
        mediaAssetId: generic.media.id,
        outcome: "safe",
        reason: "Store Conversation attachment acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const timeline = await getGuestStoreConversationTimeline(fixture.db, {
        conversationId: genericConversation.conversation.id,
        credentialToken: genericConversation.credentialToken,
        publicToken,
      })
      expect(timeline.messages.at(-1)?.attachments).toEqual([
        expect.objectContaining({ kind: "image", state: "safe" }),
      ])
      expect(JSON.stringify(timeline)).not.toContain("private/")
      expect(JSON.stringify(timeline)).not.toContain("sha256")
    })

    test("proves bounded voice duration, payload replay, participant playback, and no private projection", async () => {
      const runId = randomUUID()
      const guest = await bootstrapWebStoreConversation(fixture.db, {
        publicToken,
      })
      if (!guest.credentialToken) throw new Error("Guest credential missing")
      const staged = await sendGuestStoreConversationText(fixture.db, {
        clientOperationId: `voice-text-${runId}`,
        conversationId: guest.conversation.id,
        credentialToken: guest.credentialToken,
        publicToken,
        requestIntent: "choose_request",
        text: "I want to describe the item by voice",
      })
      const selected = await selectGuestStoreConversationRequest(fixture.db, {
        clientOperationId: `voice-request-${runId}`,
        conversationId: guest.conversation.id,
        credentialToken: guest.credentialToken,
        messageId: staged.message.id,
        publicToken,
        target: { kind: "new_commerce_inquiry" },
      })
      const inquiryId = selected.message.request?.id
      if (!inquiryId) throw new Error("Voice Request was not linked")
      const line = await fixture.db.commerceInquiryLine.findFirstOrThrow({
        select: {
          createdAt: true,
          description: true,
          id: true,
          position: true,
          requestedQuantity: true,
        },
        where: { inquiryId },
      })
      const sourceVersion = createHash("sha256")
        .update(
          JSON.stringify({
            description: line.description,
            position: line.position,
            quantity: line.requestedQuantity?.toString() ?? null,
          }),
        )
        .digest("hex")
      const command = {
        actorUserId: "public_store_conversation",
        channel: "web" as const,
        clientMediaId: `voice-media-${runId}`,
        contentDigest: "d".repeat(64),
        fileName: "voice-note.m4a",
        kind: "audio" as const,
        mimeType: "audio/mp4" as const,
        privateMediaProviderReady: true,
        retentionUntil: new Date("2027-08-13T00:00:00.000Z"),
        signatureMimeType: "audio/mp4" as const,
        sizeBytes: 1_024,
        source: { id: inquiryId, kind: "commerce_inquiry" as const },
        sourceLineId: line.id,
        sourceVersion,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        verifiedDurationMs: 1_250,
      }
      const voice = await recordServiceCommerceMediaIntake(fixture.db, command)
      expect(
        await recordServiceCommerceMediaIntake(fixture.db, command),
      ).toMatchObject({ replayed: true })
      await recordStoredServiceCommerceMediaAsset(fixture.db, {
        contentDigest: command.contentDigest,
        mediaAssetId: voice.media.id,
        objectKey: `private/${runId}/voice-note.m4a`,
        reason: "Store Conversation voice acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        verifiedMediaType: "audio/mp4",
        verifiedSizeBytes: command.sizeBytes,
      })
      await requestServiceCommerceMediaSafety(fixture.db, {
        mediaAssetId: voice.media.id,
        reason: "Store Conversation voice acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      await recordServiceCommerceMediaSafety(fixture.db, {
        mediaAssetId: voice.media.id,
        outcome: "safe",
        reason: "Store Conversation voice acceptance",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
      const message = await appendGuestStoreConversationAttachment(fixture.db, {
        channel: "web",
        clientOperationId: `voice-attachment-${runId}`,
        conversationId: guest.conversation.id,
        credentialToken: guest.credentialToken,
        owner: { kind: "generic", sourceAttachmentId: voice.attachment.id },
        publicToken,
        request: {
          id: inquiryId,
          kind: "commerce_inquiry",
          revision: 1,
        },
      })
      expect(message.message.attachments).toEqual([
        expect.objectContaining({
          durationMs: 1_250,
          kind: "audio",
          state: "safe",
          viewable: true,
        }),
      ])
      const grant = await authorizeGuestStoreConversationVoiceNoteView(
        fixture.db,
        {
          conversationId: guest.conversation.id,
          credentialToken: guest.credentialToken,
          expiresAt: new Date(Date.now() + 30_000),
          messageAttachmentId: message.message.attachments[0]?.id ?? "missing",
          publicToken,
        },
      )
      expect(grant).toMatchObject({ mediaAssetId: voice.media.id })
      const timeline = await getGuestStoreConversationTimeline(fixture.db, {
        conversationId: guest.conversation.id,
        credentialToken: guest.credentialToken,
        publicToken,
      })
      expect(JSON.stringify(timeline)).not.toContain(grant.storageReference)
      expect(JSON.stringify(timeline)).not.toContain(command.contentDigest)
    })
  },
)
