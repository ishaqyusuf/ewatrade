import {
  type ConversationStateStore,
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  getConfiguredConversationStateStore,
  prescriptionConversationContextId,
  resolveCommunicationsCredential,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  claimWhatsAppInboundEvent,
  consumePrescriptionQuickAction,
  continueWhatsAppPrescriptionRequest,
  createPrescriptionCommunicationIntent,
  markWhatsAppInboundEventProcessed,
  submitWhatsAppPrescriptionRequest,
} from "@ewatrade/db/queries"
import { storePrescriptionMedia } from "@ewatrade/prescriptions"

import { triggerJob } from "../trigger"
import { prescriptionCommunicationDispatchHandler } from "./prescription-communication-dispatch"
import { prescriptionMediaSafetyHandler } from "./prescription-media-safety"

export type PrescriptionWhatsAppInboundPayload = { inboundEventId: string }

type Claim = NonNullable<Awaited<ReturnType<typeof claimWhatsAppInboundEvent>>>

type Dependencies = {
  claim(input: PrescriptionWhatsAppInboundPayload): Promise<Claim | null>
  complete(input: {
    failureCode?: string
    inboundEventId: string
    requestId?: string
  }): Promise<unknown>
  continueRequest(input: {
    manualIntakeText?: string
    media: Array<{
      clientMediaId: string
      mediaType: string
      objectKey: string
      originalFileName: string
      pageNumber: number
      sha256: string
      sizeBytes: number
    }>
    providerEventId: string
    requestId: string
    storeId: string
    tenantId: string
  }): Promise<{
    created: boolean
    reference: string
    requestId: string
  } | null>
  consumeQuickAction(input: {
    actionId: string
    storeId: string
    tenantId: string
  }): Promise<unknown>
  createIntent(input: {
    deduplicationKey: string
    payload: Record<string, unknown>
    recipientReference: string
    storeId: string
    tenantId: string
    type: "clarification" | "quote_ready"
  }): Promise<{ id: string }>
  enqueueDispatch(intentId: string): Promise<unknown>
  enqueueSafety(requestId: string): Promise<unknown>
  provider: WhatsAppProvider
  state: ConversationStateStore
  submit(input: {
    clientRequestId: string
    consentAcceptedAt: Date
    consentVersion: string
    customerPhone: string
    fulfilmentPreference: "unspecified"
    manualIntakeText?: string
    media: Array<{
      clientMediaId: string
      mediaType: string
      objectKey: string
      originalFileName: string
      pageNumber: number
      sha256: string
      sizeBytes: number
    }>
    providerEventId: string
    sourceContext: Record<string, unknown>
    storeId: string
    tenantId: string
  }): Promise<{
    created: boolean
    reference: string
    requestId: string
  }>
}

function defaultDependencies(): Dependencies {
  return {
    claim: (input) => claimWhatsAppInboundEvent(prisma, input),
    complete: (input) => markWhatsAppInboundEventProcessed(prisma, input),
    continueRequest: (input) =>
      continueWhatsAppPrescriptionRequest(prisma, input),
    consumeQuickAction: (input) =>
      consumePrescriptionQuickAction(prisma, input),
    createIntent: (input) =>
      createPrescriptionCommunicationIntent(prisma, input),
    enqueueDispatch: (intentId) =>
      triggerJob(
        "prescriptions.communication-dispatch",
        prescriptionCommunicationDispatchHandler,
        { intentId },
        { maxAttempts: 4 },
      ),
    enqueueSafety: (requestId) =>
      triggerJob(
        "prescriptions.media-safety",
        prescriptionMediaSafetyHandler,
        { requestId },
        { maxAttempts: 4 },
      ),
    provider: new DirectMetaWhatsAppProvider(),
    state: getConfiguredConversationStateStore(),
    submit: (input) => submitWhatsAppPrescriptionRequest(prisma, input),
  }
}

function normalizedPayload(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

export async function runPrescriptionWhatsAppInbound(
  payload: PrescriptionWhatsAppInboundPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claim = await dependencies.claim(payload)
  if (!claim) return null
  const normalized = normalizedPayload(claim.normalizedPayload)
  try {
    const mediaId = String(normalized.mediaId ?? "")
    const text = String(normalized.text ?? "").trim()
    const quickActionId = String(normalized.quickActionId ?? "").trim()
    if (quickActionId) {
      const action = (await dependencies.consumeQuickAction({
        actionId: quickActionId,
        storeId: claim.storeId,
        tenantId: claim.tenantId,
      })) as {
        action: string
        entityId: string
        entityType: string
        publicAccessToken: string
      }
      const storefrontUrl =
        process.env.STOREFRONT_URL?.replace(/\/$/, "") ??
        "http://ewatrade-storefront.localhost"
      const intent = await dependencies.createIntent({
        deduplicationKey: `quick-action:${claim.providerEventId}`,
        payload:
          action.entityType === "quote_version"
            ? {
                secureUrl: `${storefrontUrl}/prescription-quote/${action.publicAccessToken}`,
              }
            : {},
        recipientReference: claim.externalCustomerId,
        storeId: claim.storeId,
        tenantId: claim.tenantId,
        type:
          action.action === "ask_pharmacy" ? "clarification" : "quote_ready",
      })
      await dependencies.enqueueDispatch(intent.id)
      await dependencies.complete({ inboundEventId: claim.inboundEventId })
      return {
        action: action.action,
        entityId: action.entityId,
        entityType: action.entityType,
      }
    }
    const media = []
    if (mediaId) {
      const fetched = await dependencies.provider.fetchMedia({
        accessToken: resolveCommunicationsCredential(claim.credentialReference),
        mediaId,
        phoneNumberId: claim.phoneNumberId,
      })
      media.push(
        await storePrescriptionMedia({
          bytes: fetched.bytes,
          clientMediaId: claim.providerEventId,
          mediaType: fetched.mediaType,
          originalFileName: "whatsapp-prescription",
          pageNumber: 1,
          scopeId: claim.connectionId,
        }),
      )
    }
    if (!media.length && !text) {
      await dependencies.complete({
        failureCode: "unsupported_message",
        inboundEventId: claim.inboundEventId,
      })
      return null
    }
    const continued = claim.requestId
      ? await dependencies.continueRequest({
          manualIntakeText: media.length ? undefined : text,
          media,
          providerEventId: claim.providerEventId,
          requestId: claim.requestId,
          storeId: claim.storeId,
          tenantId: claim.tenantId,
        })
      : null
    const request =
      continued ??
      (await dependencies.submit({
        clientRequestId: `whatsapp:${claim.providerEventId}`,
        consentAcceptedAt: new Date(),
        consentVersion: "whatsapp-customer-initiated-v1",
        customerPhone: claim.externalCustomerId,
        fulfilmentPreference: "unspecified",
        manualIntakeText: media.length ? undefined : text,
        media,
        providerEventId: claim.providerEventId,
        sourceContext: { connectionId: claim.connectionId },
        storeId: claim.storeId,
        tenantId: claim.tenantId,
      }))
    if (media.length) {
      await dependencies.enqueueSafety(request.requestId)
    }
    const contextId = prescriptionConversationContextId(claim.storeId)
    await dependencies.state.set({
      connectionId: claim.connectionId,
      contextId,
      externalCustomerId: claim.externalCustomerId,
      state: {
        contextId,
        lastSeenAt: new Date().toISOString(),
        requestId: request.requestId,
        storeId: claim.storeId,
        tenantId: claim.tenantId,
      },
    })
    await dependencies.complete({
      inboundEventId: claim.inboundEventId,
      requestId: request.requestId,
    })
    return request
  } catch (error) {
    await dependencies.complete({
      failureCode: "processing_failed",
      inboundEventId: claim.inboundEventId,
    })
    throw error
  }
}

export async function prescriptionWhatsAppInboundHandler(
  payload: PrescriptionWhatsAppInboundPayload,
) {
  await runPrescriptionWhatsAppInbound(payload)
}
