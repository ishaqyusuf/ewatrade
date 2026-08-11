import { createHmac } from "node:crypto"

import {
  customerChannelConversationContextId,
  extractCustomerChannelIntakeSelection,
  extractWhatsAppChannelContext,
  getConfiguredConversationStateStore,
  parseMetaWhatsAppEvents,
  prescriptionConversationContextId,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  ServiceCommercePolicyError,
  WhatsAppConnectionError,
  recordServiceCommerceCustomerNotificationReceipt,
  recordServiceCommerceUsageEvent,
  recordWhatsAppCommunicationStatus,
  recordWhatsAppInboundEvent,
  recordWhatsAppRoutingAlert,
  resolveWhatsAppInboundConnection,
  resolveWhatsAppInboundStore,
  resolveWhatsAppStatusConnection,
} from "@ewatrade/db/queries"
import {
  enqueuePrescriptionWhatsAppInbound,
  enqueueServiceCommerceWhatsAppInbound,
} from "@ewatrade/jobs"

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function safeUsageDeduplicationKey(input: {
  connectionId: string
  providerMessageId: string
  secret: string
}) {
  return createHmac("sha256", input.secret)
    .update(
      `meta-whatsapp-delivered-usage:v1:${input.connectionId}:${input.providerMessageId}`,
    )
    .digest("hex")
}

export async function handleWhatsAppWebhookRequest(request: Request) {
  if (request.method === "GET") {
    const url = new URL(request.url)
    const challenge = verifyMetaWebhookChallenge({
      challenge: url.searchParams.get("hub.challenge"),
      mode: url.searchParams.get("hub.mode"),
      token: url.searchParams.get("hub.verify_token"),
      verifyToken: required("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    })
    return challenge
      ? new Response(challenge, { status: 200 })
      : new Response("Unauthorized", { status: 401 })
  }

  const body = await request.text()
  if (
    !verifyMetaWebhookSignature({
      appSecret: required("META_APP_SECRET"),
      body,
      signature: request.headers.get("x-hub-signature-256"),
    })
  ) {
    return new Response("Unauthorized", { status: 401 })
  }
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response("Invalid event", { status: 400 })
  }
  const state = getConfiguredConversationStateStore()
  for (const event of parseMetaWhatsAppEvents(payload)) {
    if (event.kind === "status") {
      let receiptRoute: Awaited<
        ReturnType<typeof resolveWhatsAppStatusConnection>
      >
      try {
        receiptRoute = await resolveWhatsAppStatusConnection(prisma, {
          phoneNumberId: event.phoneNumberId,
          providerMessageId: event.messageId,
        })
      } catch (error) {
        if (!(error instanceof WhatsAppConnectionError)) throw error
        await recordWhatsAppRoutingAlert(prisma, {
          code: "inactive_or_unknown_connection",
          phoneNumberId: event.phoneNumberId,
          providerEventId: event.messageId,
        })
        continue
      }
      const timestampSeconds = Number(event.timestamp)
      const occurredAt = Number.isFinite(timestampSeconds)
        ? new Date(timestampSeconds * 1_000)
        : new Date()
      if (receiptRoute.kind === "service_commerce") {
        if (
          event.status === "delivered" ||
          event.status === "failed" ||
          event.status === "read"
        ) {
          await recordServiceCommerceCustomerNotificationReceipt(prisma, {
            intentId: receiptRoute.intentId,
            occurredAt,
            providerReceiptId: `${event.messageId}:${event.status}`,
            status: event.status,
            storeId: receiptRoute.storeId,
            tenantId: receiptRoute.tenantId,
          })
          if (event.status === "delivered") {
            // Meta sends category/billable metadata but no monetary amount in
            // a status callback. A non-billable receipt is a known zero; every
            // other external Meta cost stays explicitly unknown until
            // reconciled. Read and failed statuses remain reliability receipts
            // and never create a second usage fact for this provider message.
            await recordServiceCommerceUsageEvent(prisma, {
              billingOwnerSnapshot: receiptRoute.billingOwnerSnapshot,
              connectionId: receiptRoute.connectionId,
              currencyCode: receiptRoute.currencyCode,
              deduplicationKey: safeUsageDeduplicationKey({
                connectionId: receiptRoute.connectionId,
                providerMessageId: event.messageId,
                secret: required("META_APP_SECRET"),
              }),
              eventType: "message_delivered",
              messageCategory: event.pricing?.messageCategory ?? null,
              metaCostMinor: event.pricing?.billable === false ? 0 : null,
              occurredAt,
              providerKey: "meta-cloud-api",
              recipientMarket: event.pricing?.recipientMarket ?? null,
              reconciliationSource: "meta_whatsapp_status_webhook",
              reconciliationStatus: "pending",
              sourceId: receiptRoute.intentId,
              sourceKind: "customer_channel",
              storeId: receiptRoute.storeId,
              tenantId: receiptRoute.tenantId,
            })
          }
        }
      } else {
        await recordWhatsAppCommunicationStatus(prisma, {
          connectionId: receiptRoute.connectionId,
          failureCode: event.failureCode,
          occurredAt,
          providerMessageId: event.messageId,
          status: event.status,
          tenantId: receiptRoute.tenantId,
        })
      }
      continue
    }
    let route: Awaited<ReturnType<typeof resolveWhatsAppInboundConnection>>
    try {
      route = await resolveWhatsAppInboundConnection(prisma, {
        phoneNumberId: event.phoneNumberId,
      })
    } catch (error) {
      if (!(error instanceof WhatsAppConnectionError)) throw error
      await recordWhatsAppRoutingAlert(prisma, {
        code: "inactive_or_unknown_connection",
        phoneNumberId: event.phoneNumberId,
        providerEventId: event.messageId,
      })
      continue
    }
    const channelToken = extractWhatsAppChannelContext(event.text) ?? undefined
    const routingSelection =
      channelToken || event.quickActionId || !route.requiresStoreSelection
        ? null
        : await state.getRoutingSelection({
            connectionId: route.connectionId,
            externalCustomerId: event.externalCustomerId,
          })
    let binding: Awaited<ReturnType<typeof resolveWhatsAppInboundStore>>
    try {
      binding = await resolveWhatsAppInboundStore(prisma, {
        channelToken,
        connectionId: route.connectionId,
        quickActionId: event.quickActionId,
        storeId:
          channelToken || event.quickActionId
            ? undefined
            : !route.requiresStoreSelection
              ? route.bindings[0]?.storeId
              : routingSelection?.tenantId === route.tenantId
                ? routingSelection.storeId
                : undefined,
        tenantId: route.tenantId,
      })
    } catch (error) {
      if (!(error instanceof WhatsAppConnectionError)) throw error
      await recordWhatsAppRoutingAlert(prisma, {
        code: "ambiguous_store_binding",
        connectionId: route.connectionId,
        phoneNumberId: route.phoneNumberId,
        providerEventId: event.messageId,
        tenantId: route.tenantId,
      })
      continue
    }
    await state.setRoutingSelection({
      connectionId: route.connectionId,
      externalCustomerId: event.externalCustomerId,
      storeId: binding.storeId,
      tenantId: binding.tenantId,
    })
    const contextId =
      binding.routeVertical === "pharmacy"
        ? prescriptionConversationContextId(binding.storeId)
        : customerChannelConversationContextId(binding.storeId)
    const existingState = await state.get({
      connectionId: route.connectionId,
      contextId,
      externalCustomerId: event.externalCustomerId,
    })
    const intakeKind =
      binding.routeVertical === "service"
        ? (extractCustomerChannelIntakeSelection(event.text) ??
          existingState?.intakeKind)
        : undefined
    await state.set({
      connectionId: route.connectionId,
      contextId,
      externalCustomerId: event.externalCustomerId,
      state: {
        contextId,
        intakeKind,
        lastSeenAt: new Date().toISOString(),
        requestId:
          existingState?.storeId === binding.storeId
            ? existingState.requestId
            : undefined,
        storeId: binding.storeId,
        tenantId: binding.tenantId,
      },
    })
    let inbound: Awaited<ReturnType<typeof recordWhatsAppInboundEvent>>
    try {
      inbound = await recordWhatsAppInboundEvent(prisma, {
        connectionId: route.connectionId,
        externalCustomerId: event.externalCustomerId,
        messageType: event.type,
        normalizedPayload: {
          mediaId: event.media?.id,
          mediaType: event.media?.mediaType,
          intakeKind,
          quickActionId: event.quickActionId,
          storeId: binding.storeId,
          text: event.text,
        },
        providerEventId: event.messageId,
        requestId:
          existingState?.storeId === binding.storeId
            ? existingState.requestId
            : undefined,
        storeId: binding.storeId,
        tenantId: binding.tenantId,
        routeVertical: binding.routeVertical,
      })
    } catch (error) {
      if (!(error instanceof ServiceCommercePolicyError)) throw error
      await recordWhatsAppRoutingAlert(prisma, {
        code: "inactive_or_unknown_connection",
        connectionId: route.connectionId,
        phoneNumberId: route.phoneNumberId,
        providerEventId: event.messageId,
        tenantId: route.tenantId,
      })
      continue
    }
    if (binding.routeVertical === "pharmacy") {
      await enqueuePrescriptionWhatsAppInbound(inbound.id)
    } else {
      await enqueueServiceCommerceWhatsAppInbound(inbound.id)
    }
  }
  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
    status: 200,
  })
}
