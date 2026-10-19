import { expect, mock, test } from "bun:test"
import { createHmac } from "node:crypto"
import * as communications from "../../../../packages/communications/src/whatsapp"

let stateCreations = 0
const unexpected = () => {
  throw new Error("Unexpected database, assistant or queue operation")
}
mock.module("@ewatrade/communications", () => ({
  ...communications,
  getConfiguredConversationStateStore: () => {
    stateCreations += 1
    return communications.getConfiguredConversationStateStore()
  },
}))
mock.module("@ewatrade/db", () => ({ prisma: {} }))
mock.module("@ewatrade/db/queries", () =>
  Object.fromEntries(
    [
      "ServiceCommercePolicyError",
      "StoreConversationWhatsAppDiscoveryError",
      "WhatsAppConnectionError",
      "isPrescriptionProductionLaunchApproved",
      "recordServiceCommerceCustomerNotificationReceipt",
      "recordServiceCommerceUsageEvent",
      "recordStoreConversationWhatsAppObservationStatus",
      "recordWhatsAppCommunicationStatus",
      "recordWhatsAppInboundEvent",
      "recordWhatsAppRoutingAlert",
      "resolveWhatsAppInboundConnection",
      "resolveWhatsAppInboundStore",
      "resolveWhatsAppStatusConnection",
    ].map((name) => [name, unexpected]),
  ),
)
mock.module("@ewatrade/jobs", () => ({
  enqueuePrescriptionWhatsAppInbound: unexpected,
  enqueueServiceCommerceWhatsAppInbound: unexpected,
}))
mock.module("@ewatrade/service-commerce/server", () => ({
  storeConversationWhatsAppBridgeTokenDigest: unexpected,
}))
mock.module("./whatsapp-platform-runtime", () => ({
  processPlatformWhatsAppEvent: unexpected,
}))
mock.module("./store-conversation-whatsapp-bridge-runtime", () => ({
  processStoreConversationWhatsAppBridgeInbound: unexpected,
}))
mock.module("./store-conversation-whatsapp-discovery-runtime", () => ({
  discoverStoreConversationWhatsAppInboundCandidate: unexpected,
  processStoreConversationWhatsAppCandidateAction: unexpected,
}))
const { handleWhatsAppWebhookRequest } = await import("./whatsapp-runtime")

function signed(changes: unknown[]) {
  const body = JSON.stringify({ entry: [{ changes }] })
  return new Request("https://api.example.test/api/webhooks/whatsapp", {
    method: "POST",
    body,
    headers: {
      "x-hub-signature-256": `sha256=${createHmac("sha256", "runtime-state-secret").update(body).digest("hex")}`,
    },
  })
}
function message(id: string, text: string, number = "123456789") {
  return {
    value: {
      metadata: { phone_number_id: number },
      messages: [
        { id, from: "2348000000000", type: "text", text: { body: text } },
      ],
    },
  }
}

test("full runtime preserves platform processing without merchant Redis and creates state only for merchant events", async () => {
  process.env.NODE_ENV = "production"
  process.env.REDIS_URL = undefined
  process.env.META_APP_SECRET = "runtime-state-secret"
  const handled: string[] = []
  const dependencies = {
    processPlatformEvent: async (
      event: communications.NormalizedWhatsAppEvent,
    ) => {
      handled.push(event.messageId)
      return event.phoneNumberId === "123456789"
    },
  }
  const response = await handleWhatsAppWebhookRequest(
    signed([
      message("turn", "search rice"),
      message("disconnect", "Disconnect EwaTrade"),
      {
        value: {
          metadata: { phone_number_id: "123456789" },
          statuses: [{ id: "correlated-receipt", status: "delivered" }],
        },
      },
    ]),
    "state-test",
    dependencies,
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ received: true })
  expect(handled).toEqual(["turn", "disconnect", "correlated-receipt"])
  expect(stateCreations).toBe(0)
  expect(
    (await handleWhatsAppWebhookRequest(signed([]), "state-test", dependencies))
      .status,
  ).toBe(200)
  expect(stateCreations).toBe(0)

  const failed = await handleWhatsAppWebhookRequest(
    signed([message("receipt-failure", "hello")]),
    "state-test",
    {
      processPlatformEvent: async () => {
        throw new Error("receipt persistence unavailable")
      },
    },
  )
  expect(failed.status).toBe(503)
  expect(await failed.text()).toBe("Temporarily unavailable")
  expect(stateCreations).toBe(0)

  handled.length = 0
  await expect(
    handleWhatsAppWebhookRequest(
      signed([
        message("reserved-before", "hello"),
        message("merchant", "hello", "merchant-number"),
        message("reserved-after", "hello"),
      ]),
      "state-test",
      dependencies,
    ),
  ).rejects.toThrow(
    "Redis is required for production WhatsApp conversation state",
  )
  expect(handled).toEqual(["reserved-before", "merchant"])
  expect(stateCreations).toBe(1)
})
