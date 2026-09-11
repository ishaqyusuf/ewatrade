import { protectCommunicationsRecipient } from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import { StoreConversationRequestKind } from "@ewatrade/db/enums"
import {
  bindStoreConversationWhatsAppBridgeNewRequest,
  bindStoreConversationWhatsAppDirectSession,
  claimWhatsAppInboundEvent,
  getCommerceInquiryIntakeAttachmentTarget,
  markWhatsAppInboundEventProcessed,
  recordServiceCommerceMediaIntake,
  releaseWhatsAppInboundEventForRetry,
  submitServiceCommerceIntake,
} from "@ewatrade/db/queries"
import {
  SERVICE_COMMERCE_MEDIA_BASELINE_RETENTION_DAYS,
  serviceCommerceMediaMimeTypeSchema,
} from "@ewatrade/service-commerce"
import { storeConversationWhatsAppBridgeTokenDigest } from "@ewatrade/service-commerce/server"

import { triggerJob } from "../trigger"
import { serviceCommerceMediaIngestHandler } from "./service-commerce-media-ingest"

export type ServiceCommerceWhatsAppInboundPayload = {
  inboundEventId: string
}

type Claim = NonNullable<Awaited<ReturnType<typeof claimWhatsAppInboundEvent>>>

export type ServiceCommerceWhatsAppInboundDependencies = {
  bindBridgeRequest(
    input: Parameters<typeof bindStoreConversationWhatsAppBridgeNewRequest>[1],
  ): Promise<
    Awaited<ReturnType<typeof bindStoreConversationWhatsAppBridgeNewRequest>>
  >
  bindDirectSession(
    input: Parameters<typeof bindStoreConversationWhatsAppDirectSession>[1],
  ): Promise<
    Awaited<ReturnType<typeof bindStoreConversationWhatsAppDirectSession>>
  >
  claim(input: ServiceCommerceWhatsAppInboundPayload): Promise<Claim | null>
  complete(input: {
    failureCode?: string
    inboundEventId: string
    requestId?: string
  }): Promise<unknown>
  digestProviderEvent(value: string): string
  enqueueMedia(input: {
    mediaAssetId: string
    storeId: string
    tenantId: string
  }): Promise<unknown>
  protectRecipient(value: string): string
  recordMedia(
    input: Parameters<typeof recordServiceCommerceMediaIntake>[1],
  ): Promise<Awaited<ReturnType<typeof recordServiceCommerceMediaIntake>>>
  resolveAttachmentTarget(
    input: Parameters<typeof getCommerceInquiryIntakeAttachmentTarget>[1],
  ): Promise<
    Awaited<ReturnType<typeof getCommerceInquiryIntakeAttachmentTarget>>
  >
  submit(
    input: Parameters<typeof submitServiceCommerceIntake>[1],
  ): Promise<Awaited<ReturnType<typeof submitServiceCommerceIntake>>>
  retry(input: {
    failureCode: string
    inboundEventId: string
    storeId: string
    tenantId: string
  }): Promise<unknown>
}

function dependencies(): ServiceCommerceWhatsAppInboundDependencies {
  return {
    bindBridgeRequest: (input) =>
      bindStoreConversationWhatsAppBridgeNewRequest(prisma, input),
    bindDirectSession: (input) =>
      bindStoreConversationWhatsAppDirectSession(prisma, input),
    claim: (input) => claimWhatsAppInboundEvent(prisma, input),
    complete: (input) => markWhatsAppInboundEventProcessed(prisma, input),
    digestProviderEvent: storeConversationWhatsAppBridgeTokenDigest,
    enqueueMedia: (input) =>
      triggerJob(
        "service-commerce.media-ingest",
        serviceCommerceMediaIngestHandler,
        input,
        { maxAttempts: 4 },
      ),
    protectRecipient: protectCommunicationsRecipient,
    recordMedia: (input) => recordServiceCommerceMediaIntake(prisma, input),
    retry: (input) => releaseWhatsAppInboundEventForRetry(prisma, input),
    resolveAttachmentTarget: (input) =>
      getCommerceInquiryIntakeAttachmentTarget(prisma, input),
    submit: (input) => submitServiceCommerceIntake(prisma, input),
  }
}

function normalizedPayload(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

function isEntrySelectionMessage(text: string) {
  return /(?:^|\s)(?:ewa|rx)store:[^\s]+/i.test(text)
}

function mediaFileName(mimeType: string) {
  if (mimeType === "application/pdf") return "customer-document.pdf"
  const extension = mimeType.split("/")[1] ?? "image"
  return `customer-image.${extension}`
}

export async function runServiceCommerceWhatsAppInbound(
  payload: ServiceCommerceWhatsAppInboundPayload,
  injected: ServiceCommerceWhatsAppInboundDependencies = dependencies(),
) {
  const claim = await injected.claim(payload)
  if (!claim) return null
  const normalized = normalizedPayload(claim.normalizedPayload)
  const intakeKind = String(normalized.intakeKind ?? "")
  const mediaId = String(normalized.mediaId ?? "").trim()
  const text = String(normalized.text ?? "").trim()

  try {
    if (claim.routeVertical !== "service") {
      await injected.complete({
        failureCode: "route_vertical_mismatch",
        inboundEventId: claim.inboundEventId,
      })
      return null
    }
    if (isEntrySelectionMessage(text) && !mediaId) {
      await injected.complete({ inboundEventId: claim.inboundEventId })
      return { status: "selection_recorded" as const }
    }
    if (intakeKind !== "commerce_inquiry") {
      await injected.complete({
        failureCode: "source_selection_required",
        inboundEventId: claim.inboundEventId,
      })
      return { status: "source_selection_required" as const }
    }
    if (!text && !mediaId) {
      await injected.complete({
        failureCode: "unsupported_message",
        inboundEventId: claim.inboundEventId,
      })
      return null
    }

    const mediaType = mediaId
      ? serviceCommerceMediaMimeTypeSchema.safeParse(normalized.mediaType)
      : null
    if (mediaId && !mediaType?.success) {
      await injected.complete({
        failureCode: "unsupported_media_type",
        inboundEventId: claim.inboundEventId,
      })
      return null
    }
    const summary =
      text || "Customer shared an image or document for identification."
    const result = await injected.submit({
      envelope: {
        channel: "whatsapp",
        clientCommandId: `whatsapp:${claim.providerEventId}`,
        consent: {
          contactOptIn: false,
          privacyNoticeVersion: "whatsapp-customer-initiated-v1",
        },
        context: {
          inboundEventId: claim.inboundEventId,
          kind: "inbound_event",
        },
        intent: {
          customer: {
            name: "WhatsApp customer",
            phone: claim.externalCustomerId,
          },
          demand: {
            kind: "commerce_inquiry",
            reason: mediaId
              ? "needs_identification"
              : "needs_availability_confirmation",
          },
          kind: "commerce_inquiry",
          lines: [{ description: summary }],
          summary,
        },
        providerEventId: claim.providerEventId,
      },
    })
    if (result.status !== "accepted") {
      await injected.complete({
        failureCode: result.code,
        inboundEventId: claim.inboundEventId,
      })
      return result
    }

    const bridgeId = String(normalized.bridgeId ?? "").trim()
    const bridgeExternalCustomerIdDigest = String(
      normalized.bridgeExternalCustomerIdDigest ?? "",
    ).trim()
    if (bridgeId) {
      if (
        result.source.kind !== "commerce_inquiry" ||
        !/^[a-f0-9]{64}$/.test(bridgeExternalCustomerIdDigest)
      ) {
        await injected.complete({
          failureCode: "bridge_request_mismatch",
          inboundEventId: claim.inboundEventId,
        })
        return { status: "source_selection_required" as const }
      }
      await injected.bindBridgeRequest({
        bridgeId,
        connectionId: claim.connectionId,
        externalCustomerIdDigest: bridgeExternalCustomerIdDigest,
        providerEventDigest: injected.digestProviderEvent(
          claim.providerEventId,
        ),
        sourceId: result.source.id,
        sourceKind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        storeId: claim.storeId,
        tenantId: claim.tenantId,
        text: summary,
      })
    }

    if (mediaId && mediaType?.success) {
      const actorUserId = `whatsapp_inbound_${claim.inboundEventId}`
      const target = await injected.resolveAttachmentTarget({
        actorUserId,
        inquiryId: result.source.id,
        storeId: claim.storeId,
        tenantId: claim.tenantId,
      })
      const recorded = await injected.recordMedia({
        actorUserId,
        channel: "whatsapp",
        clientMediaId: claim.providerEventId,
        fileName: mediaFileName(mediaType.data),
        kind: mediaType.data === "application/pdf" ? "document" : "image",
        mimeType: mediaType.data,
        privateMediaProviderReady: true,
        provider: "meta",
        providerConnectionId: claim.connectionId,
        providerMediaId: mediaId,
        retentionUntil: new Date(
          Date.now() +
            SERVICE_COMMERCE_MEDIA_BASELINE_RETENTION_DAYS * 86_400_000,
        ),
        signatureMimeType: null,
        sizeBytes: 0,
        ...target,
        storeId: claim.storeId,
        tenantId: claim.tenantId,
      })
      await injected.enqueueMedia({
        mediaAssetId: recorded.media.id,
        storeId: claim.storeId,
        tenantId: claim.tenantId,
      })
    }
    if (!bridgeId) {
      const providerDigest = injected.digestProviderEvent(claim.providerEventId)
      await injected.bindDirectSession({
        connectionId: claim.connectionId,
        externalCustomerIdCiphertext: injected.protectRecipient(
          claim.externalCustomerId,
        ),
        externalCustomerIdDigest: injected.digestProviderEvent(
          claim.externalCustomerId,
        ),
        inboundEventId: claim.inboundEventId,
        providerEventDigest: providerDigest,
        providerMessageDigest: providerDigest,
        sourceId: result.source.id,
        sourceKind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        storeId: claim.storeId,
        tenantId: claim.tenantId,
        text: summary,
      })
    } else {
      await injected.complete({
        inboundEventId: claim.inboundEventId,
        requestId: result.source.id,
      })
    }
    return result
  } catch (error) {
    await injected.retry({
      failureCode: "processing_failed",
      inboundEventId: claim.inboundEventId,
      storeId: claim.storeId,
      tenantId: claim.tenantId,
    })
    throw error
  }
}

export async function serviceCommerceWhatsAppInboundHandler(
  payload: ServiceCommerceWhatsAppInboundPayload,
) {
  await runServiceCommerceWhatsAppInbound(payload)
}
