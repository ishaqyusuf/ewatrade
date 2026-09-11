import { createHmac } from "node:crypto"

import { afterEach, describe, expect, test } from "bun:test"

import { handleWhatsAppWebhookRequest } from "./whatsapp-runtime"

const originalSecret = process.env.META_APP_SECRET

afterEach(() => {
  if (originalSecret === undefined) process.env.META_APP_SECRET = undefined
  else process.env.META_APP_SECRET = originalSecret
})

describe("WhatsApp webhook security boundary", () => {
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
