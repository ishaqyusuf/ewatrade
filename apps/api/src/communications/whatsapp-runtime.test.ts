import { createHmac } from "node:crypto"

import { afterEach, describe, expect, test } from "bun:test"

import { processPlatformWhatsAppEvent } from "./whatsapp-platform-runtime"
import { handleWhatsAppWebhookRequest } from "./whatsapp-runtime"

const originalSecret = process.env.META_APP_SECRET
const originalPlatformNumber = process.env.WHATSAPP_OTP_PHONE_NUMBER_ID

afterEach(() => {
  if (originalSecret === undefined) process.env.META_APP_SECRET = undefined
  else process.env.META_APP_SECRET = originalSecret
  if (originalPlatformNumber === undefined)
    Reflect.deleteProperty(process.env, "WHATSAPP_OTP_PHONE_NUMBER_ID")
  else process.env.WHATSAPP_OTP_PHONE_NUMBER_ID = originalPlatformNumber
})

describe("WhatsApp webhook security boundary", () => {
  test("verified platform OTP receipts and code replies are acknowledged without Tenant routing", async () => {
    const secret = "platform-test-secret"
    process.env.META_APP_SECRET = secret
    process.env.WHATSAPP_OTP_PHONE_NUMBER_ID = "123456789"
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123456789" },
                messages: [
                  {
                    id: "code-reply",
                    from: "2348000000000",
                    type: "text",
                    text: { body: "123456" },
                  },
                ],
                statuses: [
                  {
                    id: "otp-send",
                    status: "delivered",
                    timestamp: "1792050000",
                  },
                ],
              },
            },
          ],
        },
      ],
    })
    const response = await handleWhatsAppWebhookRequest(
      new Request("https://api.example.test/api/webhooks/whatsapp", {
        method: "POST",
        body,
        headers: {
          "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
        },
      }),
      "otp-isolation-test",
      {
        processPlatformEvent: (event) =>
          processPlatformWhatsAppEvent(event, {
            env: { WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789" },
            receipt: async () => null,
            accept: async () => {
              throw Error("disabled assistant must not ingest")
            },
            enqueue: async () => {},
            claim: async () => false,
            disconnect: async () => {},
          }),
      },
    )
    expect(response.status).toBe(200)
  })
  test("rejects an invalid provider signature before event parsing or routing", async () => {
    process.env.META_APP_SECRET = "ticket-14-meta-test-secret"
    const response = await handleWhatsAppWebhookRequest(
      new Request("https://api.example.test/webhooks/whatsapp", {
        body: "not-json-and-must-not-be-parsed",
        headers: { "x-hub-signature-256": "sha256=invalid" },
        method: "POST",
      }),
    )

    expect(response.status).toBe(401)
    expect(await response.text()).toBe("Unauthorized")
  })

  test("parses JSON only after the provider signature is valid", async () => {
    const secret = "ticket-14-meta-test-secret"
    const body = "not-json"
    process.env.META_APP_SECRET = secret
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
    const response = await handleWhatsAppWebhookRequest(
      new Request("https://api.example.test/webhooks/whatsapp", {
        body,
        headers: { "x-hub-signature-256": signature },
        method: "POST",
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toBe("Invalid event")
  })
})

function signed(body: string, secret: string) {
  return new Request("https://api.example.test/webhooks/whatsapp", {
    method: "POST",
    body,
    headers: {
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
  })
}
function batch(size = 1) {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123456789" },
              messages: Array.from({ length: size }, (_, n) => ({
                id: `message-${n}`,
                from: "2348000000000",
                timestamp: "1792050000",
                type: "text",
                text: { body: "search rice" },
              })),
            },
          },
        ],
      },
    ],
  })
}

test("verified webhook acknowledges only after durable platform acceptance and asks provider to retry storage failure", async () => {
  const secret = "durable-ingress-test-secret"
  process.env.META_APP_SECRET = secret
  const events: string[] = []
  const response = await handleWhatsAppWebhookRequest(
    signed(batch(), secret),
    "test",
    {
      processPlatformEvent: async (event) => {
        events.push(event.messageId)
        return true
      },
    },
  )
  expect(response.status).toBe(200)
  expect(events).toEqual(["message-0"])
  const unavailable = await handleWhatsAppWebhookRequest(
    signed(batch(), secret),
    "test",
    {
      processPlatformEvent: async () => {
        throw Error("private-db-error")
      },
    },
  )
  expect(unavailable.status).toBe(503)
  expect(await unavailable.text()).toBe("Temporarily unavailable")
  const badSignature = new Request(
    "https://api.example.test/webhooks/whatsapp",
    {
      method: "POST",
      body: batch(),
      headers: { "x-hub-signature-256": "sha256=invalid" },
    },
  )
  expect(
    (
      await handleWhatsAppWebhookRequest(badSignature, "test", {
        processPlatformEvent: async () => {
          throw Error("must not run")
        },
      })
    ).status,
  ).toBe(401)
})
test("bounds webhook bytes and event count before any dispatch", async () => {
  const secret = "durable-ingress-test-secret"
  process.env.META_APP_SECRET = secret
  let dispatched = false
  const deps = {
    processPlatformEvent: async () => {
      dispatched = true
      return true
    },
  }
  expect(
    (
      await handleWhatsAppWebhookRequest(
        signed("a".repeat(1024 * 1024 + 1), secret),
        "test",
        deps,
      )
    ).status,
  ).toBe(413)
  expect(
    (
      await handleWhatsAppWebhookRequest(
        signed(batch(101), secret),
        "test",
        deps,
      )
    ).status,
  ).toBe(413)
  expect(dispatched).toBe(false)
})
