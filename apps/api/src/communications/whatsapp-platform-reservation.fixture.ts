import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import { createHmac } from "node:crypto"

import * as communications from "../../../../packages/communications/src/whatsapp"
import { customerWhatsAppEvents } from "./whatsapp-platform-reservation"

let stateCreations = 0
const routed: string[] = []
const alerts: string[] = []
class WhatsAppConnectionError extends Error {}
class StoreConversationWhatsAppDiscoveryError extends Error {}
class ServiceCommercePolicyError extends Error {}
const unexpected = () => {
  throw new Error("Unexpected persistence or queue operation")
}
mock.module("@ewatrade/communications", () => ({
  ...communications,
  getConfiguredConversationStateStore: () => {
    stateCreations += 1
    return communications.getConfiguredConversationStateStore()
  },
}))
mock.module("@ewatrade/db", () => ({ prisma: {} }))
mock.module("@ewatrade/db/queries", () => ({
  WhatsAppConnectionError,
  StoreConversationWhatsAppDiscoveryError,
  ServiceCommercePolicyError,
  isPrescriptionProductionLaunchApproved: unexpected,
  recordServiceCommerceCustomerNotificationReceipt: unexpected,
  recordServiceCommerceUsageEvent: unexpected,
  recordStoreConversationWhatsAppObservationStatus: unexpected,
  recordWhatsAppCommunicationStatus: unexpected,
  recordWhatsAppInboundEvent: unexpected,
  recordWhatsAppRoutingAlert: async (
    _db: unknown,
    input: { phoneNumberId: string },
  ) => {
    alerts.push(input.phoneNumberId)
  },
  resolveWhatsAppInboundConnection: async (
    _db: unknown,
    route: { phoneNumberId: string },
  ) => {
    routed.push(route.phoneNumberId)
    throw new WhatsAppConnectionError("Unknown merchant number")
  },
  resolveWhatsAppInboundStore: unexpected,
  resolveWhatsAppStatusConnection: unexpected,
}))
mock.module("@ewatrade/jobs", () => ({
  enqueuePrescriptionWhatsAppInbound: unexpected,
  enqueueServiceCommerceWhatsAppInbound: unexpected,
}))
mock.module("@ewatrade/service-commerce/server", () => ({
  storeConversationWhatsAppBridgeTokenDigest: unexpected,
}))
mock.module("./store-conversation-whatsapp-bridge-runtime", () => ({
  processStoreConversationWhatsAppBridgeInbound: unexpected,
}))
mock.module("./store-conversation-whatsapp-discovery-runtime", () => ({
  discoverStoreConversationWhatsAppInboundCandidate: unexpected,
  processStoreConversationWhatsAppCandidateAction: unexpected,
}))
const { handleWhatsAppWebhookRequest } = await import("./whatsapp-runtime")
const envKeys = [
  "META_APP_SECRET",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_OTP_PHONE_NUMBER_ID",
  "WHATSAPP_OTP_ENABLED",
  "ASSISTANT_WHATSAPP_ENABLED",
  "NODE_ENV",
  "REDIS_URL",
] as const
const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
)
beforeEach(() => {
  stateCreations = 0
  routed.length = 0
  alerts.length = 0
  process.env.META_APP_SECRET = "receiver-test-secret"
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "receiver-test-token"
  process.env.WHATSAPP_OTP_PHONE_NUMBER_ID = " 123456789 "
  process.env.WHATSAPP_OTP_ENABLED = "false"
  process.env.ASSISTANT_WHATSAPP_ENABLED = "false"
  process.env.NODE_ENV = "production"
  process.env.REDIS_URL = undefined
})
afterAll(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) process.env[key] = undefined
    else process.env[key] = originalEnv[key]
  }
})
const message = (phoneNumberId: string, id: string) => ({
  value: {
    metadata: { phone_number_id: phoneNumberId },
    messages: [
      { id, from: "2348000000000", type: "text", text: { body: "123456" } },
    ],
  },
})
function signedRequest(payload: unknown) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload)
  return new Request("https://api.example.test/api/webhooks/whatsapp", {
    method: "POST",
    body,
    headers: {
      "x-hub-signature-256": `sha256=${createHmac("sha256", "receiver-test-secret").update(body).digest("hex")}`,
    },
  })
}

test("signed shared-number messages and OTP statuses acknowledge without Redis, routing or assistant", async () => {
  const response = await handleWhatsAppWebhookRequest(
    signedRequest({
      entry: [
        {
          changes: [
            message("123456789", "platform-message"),
            {
              value: {
                metadata: { phone_number_id: "123456789" },
                statuses: [{ id: "otp-status", status: "delivered" }],
              },
            },
          ],
        },
      ],
    }),
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ received: true })
  expect(stateCreations).toBe(0)
  expect(routed).toEqual([])
  expect(alerts).toEqual([])
})

test("signed empty batch acknowledges without creating merchant state", async () => {
  expect(
    (await handleWhatsAppWebhookRequest(signedRequest({ entry: [] }))).status,
  ).toBe(200)
  expect(stateCreations).toBe(0)
})

test("mixed batch preserves merchant order and routes each merchant event once", async () => {
  process.env.NODE_ENV = "test"
  const response = await handleWhatsAppWebhookRequest(
    signedRequest({
      entry: [
        {
          changes: [
            message("merchant-1", "merchant-first"),
            message("123456789", "platform"),
            message("merchant-2", "merchant-second"),
          ],
        },
      ],
    }),
  )
  expect(response.status).toBe(200)
  expect(stateCreations).toBe(1)
  expect(routed).toEqual(["merchant-1", "merchant-2"])
  expect(alerts).toEqual(["merchant-1", "merchant-2"])
})

test("nonplatform event retains the production Redis requirement", async () => {
  await expect(
    handleWhatsAppWebhookRequest(
      signedRequest({
        entry: [{ changes: [message("merchant-1", "merchant-first")] }],
      }),
    ),
  ).rejects.toThrow(
    "Redis is required for production WhatsApp conversation state",
  )
  expect(stateCreations).toBe(1)
  expect(routed).toEqual([])
})

test("invalid signature refuses before parsing, filtering or routing", async () => {
  const response = await handleWhatsAppWebhookRequest(
    new Request("https://api.example.test/api/webhooks/whatsapp", {
      method: "POST",
      body: "not-json",
      headers: { "x-hub-signature-256": "sha256=invalid" },
    }),
  )
  expect(response.status).toBe(401)
  expect(stateCreations).toBe(0)
  expect(routed).toEqual([])
})

test("valid signature does not accept malformed JSON", async () => {
  const response = await handleWhatsAppWebhookRequest(signedRequest("not-json"))
  expect(response.status).toBe(400)
  expect(stateCreations).toBe(0)
})

test("verification challenge is exact and a wrong token is refused", async () => {
  const url =
    "https://api.example.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=001234"
  const accepted = await handleWhatsAppWebhookRequest(
    new Request(`${url}&hub.verify_token=receiver-test-token`),
  )
  expect(accepted.status).toBe(200)
  expect(await accepted.text()).toBe("001234")
  expect(
    (
      await handleWhatsAppWebhookRequest(
        new Request(`${url}&hub.verify_token=wrong`),
      )
    ).status,
  ).toBe(401)
  expect(stateCreations).toBe(0)
})

test("reservation requires an exact configured numeric number and preserves event references", () => {
  const platform = { phoneNumberId: "123456789", id: "platform" }
  const other = { phoneNumberId: "1234567890", id: "other" }
  const events = [platform, other]
  expect(customerWhatsAppEvents(events, " 123456789 ")).toEqual([other])
  expect(customerWhatsAppEvents(events, "123456789")[0]).toBe(other)
  for (const invalid of [undefined, "", " ", "123abc"]) {
    expect(customerWhatsAppEvents(events, invalid)).toEqual(events)
  }
})
