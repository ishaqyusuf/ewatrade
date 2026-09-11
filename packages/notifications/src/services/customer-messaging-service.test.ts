// @ts-expect-error Bun test runtime types are outside this package tsconfig.
import { afterEach, describe, expect, mock, test } from "bun:test"

import { CustomerMessagingService } from "./customer-messaging-service"

const originalUrl = process.env.SERVICE_SMS_WEBHOOK_URL
const originalToken = process.env.SERVICE_SMS_WEBHOOK_TOKEN
const originalFetch = globalThis.fetch
const originalQaAdapter = process.env.QA_MESSAGING_TEST_ADAPTER_ENABLED

afterEach(() => {
  if (originalUrl) process.env.SERVICE_SMS_WEBHOOK_URL = originalUrl
  else Reflect.deleteProperty(process.env, "SERVICE_SMS_WEBHOOK_URL")
  if (originalToken) process.env.SERVICE_SMS_WEBHOOK_TOKEN = originalToken
  else Reflect.deleteProperty(process.env, "SERVICE_SMS_WEBHOOK_TOKEN")
  globalThis.fetch = originalFetch
  if (originalQaAdapter) {
    process.env.QA_MESSAGING_TEST_ADAPTER_ENABLED = originalQaAdapter
  } else {
    Reflect.deleteProperty(process.env, "QA_MESSAGING_TEST_ADAPTER_ENABLED")
  }
})

describe("CustomerMessagingService", () => {
  test("sends the normalized service notification to the configured provider", async () => {
    process.env.SERVICE_SMS_WEBHOOK_URL = "https://provider.test/sms"
    process.env.SERVICE_SMS_WEBHOOK_TOKEN = "secret"
    const calls: Array<{ init?: RequestInit; url: string }> = []
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      calls.push({ init, url: String(url) })
      return new Response(JSON.stringify({ messageId: "provider-123" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      })
    }) as typeof fetch

    const result = await new CustomerMessagingService().send({
      channel: "sms",
      intentId: "intent-1",
      message: "Your order is ready.",
      tenantDataClassification: "LIVE",
      to: "+2348000000000",
    })

    expect(result).toEqual({
      providerAttemptId: "provider-123",
      providerKey: "service_sms_webhook",
      status: "sent",
    })
    expect(calls).toHaveLength(1)
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(
      "Bearer secret",
    )
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      intentId: "intent-1",
      message: "Your order is ready.",
      to: "+2348000000000",
    })
  })

  test("supports a trusted webhook that does not require a token", async () => {
    process.env.SERVICE_SMS_WEBHOOK_URL = "https://provider.test/sms"
    Reflect.deleteProperty(process.env, "SERVICE_SMS_WEBHOOK_TOKEN")
    let headers = new Headers()
    globalThis.fetch = mock(async (_url: string | URL, init?: RequestInit) => {
      headers = new Headers(init?.headers)
      return new Response("{}", { status: 200 })
    }) as typeof fetch

    await new CustomerMessagingService().send({
      channel: "sms",
      intentId: "intent-2",
      message: "Your order is ready.",
      tenantDataClassification: "LIVE",
      to: "+2348000000000",
    })

    expect(headers.has("authorization")).toBe(false)
  })

  test("blocks QA live messaging before fetch", async () => {
    process.env.SERVICE_SMS_WEBHOOK_URL = "https://provider.test/sms"
    let calls = 0
    globalThis.fetch = mock(async () => {
      calls += 1
      return new Response("{}", { status: 200 })
    }) as typeof fetch

    await expect(
      new CustomerMessagingService().send({
        channel: "sms",
        intentId: "intent-qa-blocked",
        message: "QA message",
        tenantDataClassification: "QA",
        to: "+15550102000",
      }),
    ).rejects.toThrow("unavailable for QA data")
    expect(calls).toBe(0)
  })

  test("returns an unmistakable receipt from the QA test adapter", async () => {
    process.env.QA_MESSAGING_TEST_ADAPTER_ENABLED = "true"
    const result = await new CustomerMessagingService().send({
      channel: "whatsapp",
      intentId: "intent-qa-adapter",
      message: "QA message",
      tenantDataClassification: "QA",
      to: "+15550102000",
    })
    expect(result).toEqual({
      providerAttemptId: "qa-test:intent-qa-adapter",
      providerKey: "qa_whatsapp_test_adapter",
      status: "sent",
    })
  })
})
