import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// @ts-expect-error Bun test runtime types are outside the email package tsconfig.
import { afterEach, describe, expect, test } from "bun:test"

import {
  captureEmailTransport,
  createTestRoutedEmailMessages,
  dispatchEmailMessages,
  getDefaultEmailTransport,
  resendEmailTransport,
} from "./index"

const originalNodeEnv = process.env.NODE_ENV
const originalEmailCaptureFile = process.env.EMAIL_CAPTURE_FILE
const originalResendApiKey = process.env.RESEND_API_KEY
const originalTestEmail = process.env.TEST_EMAIL
const originalTestEmails = process.env.TEST_EMAILS
const originalFetch = globalThis.fetch

afterEach(() => {
  restoreEnv("NODE_ENV", originalNodeEnv)
  restoreEnv("EMAIL_CAPTURE_FILE", originalEmailCaptureFile)
  restoreEnv("RESEND_API_KEY", originalResendApiKey)
  restoreEnv("TEST_EMAIL", originalTestEmail)
  restoreEnv("TEST_EMAILS", originalTestEmails)

  globalThis.fetch = originalFetch
})

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    clearEnv(key)
    return
  }

  process.env[key] = value
}

function clearEnv(key: string) {
  Reflect.deleteProperty(process.env, key)
}

function createBaseMessage(to = "owner@example.com") {
  return {
    from: "Ewatrade <noreply@ewatrade.com>",
    html: "<p>Hello</p>",
    replyTo: "support@ewatrade.com",
    subject: "Hello from EwaTrade",
    text: "Hello",
    to,
  }
}

describe("Resend email transport", () => {
  test("uses the capture transport when EMAIL_CAPTURE_FILE is configured", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ewatrade-email-capture-"))
    const captureFile = join(directory, "messages.jsonl")

    try {
      process.env.EMAIL_CAPTURE_FILE = captureFile
      process.env.RESEND_API_KEY = "re_test_key"

      expect(getDefaultEmailTransport()).toBe(captureEmailTransport)

      const [result] = await dispatchEmailMessages([
        {
          from: "Ewatrade <noreply@ewatrade.com>",
          html: "<p>Hello</p>",
          subject: "Captured hello",
          text: "Hello",
          to: "customer@example.com",
        },
      ])

      expect(result).toMatchObject({
        provider: "capture",
        status: "sent",
      })

      const [line] = (await readFile(captureFile, "utf8")).trim().split("\n")
      const captured = JSON.parse(line ?? "{}") as {
        subject?: string
        to?: string
      }

      expect(captured).toMatchObject({
        subject: "Captured hello",
        to: "customer@example.com",
      })
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  test("uses Resend as the default transport when RESEND_API_KEY is configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key"

    expect(getDefaultEmailTransport()).toBe(resendEmailTransport)
  })

  test("sends email messages through Resend", async () => {
    process.env.RESEND_API_KEY = "re_test_key"
    const requests: unknown[] = []

    globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))

      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
      })
    }

    const [result] = await dispatchEmailMessages([
      {
        from: "Ewatrade <noreply@ewatrade.com>",
        html: "<p>Hello</p>",
        replyTo: "support@ewatrade.com",
        subject: "Hello from EwaTrade",
        text: "Hello",
        to: "customer@example.com",
      },
    ])

    expect(result).toMatchObject({
      provider: "resend",
      providerMessageId: "email_123",
      status: "sent",
    })
    expect(requests).toEqual([
      {
        from: "Ewatrade <noreply@ewatrade.com>",
        html: "<p>Hello</p>",
        reply_to: "support@ewatrade.com",
        subject: "Hello from EwaTrade",
        text: "Hello",
        to: ["customer@example.com"],
      },
    ])
  })
})

describe("test email safety routing", () => {
  test("keeps non-test email on the original recipient outside production", () => {
    process.env.NODE_ENV = "development"
    process.env.TEST_EMAILS = "qa-one@example.com, qa-two@example.com"
    clearEnv("TEST_EMAIL")

    const message = createBaseMessage("owner@business.com")

    expect(createTestRoutedEmailMessages(message)).toEqual([message])
  })

  test("routes exact @test.com email to TEST_EMAILS recipients", () => {
    process.env.NODE_ENV = "development"
    process.env.TEST_EMAILS = "qa-one@example.com, qa-two@example.com"
    clearEnv("TEST_EMAIL")

    const messages = createTestRoutedEmailMessages(
      createBaseMessage("owner@test.com"),
    )

    expect(messages.map((message) => message.to)).toEqual([
      "qa-one@example.com",
      "qa-two@example.com",
    ])
    expect(messages[0]?.text).toContain("Original recipient: owner@test.com")
    expect(messages[0]?.html).toContain("Original recipient:")
    expect(messages[0]?.html).toContain("owner@test.com")
  })

  test("routes production @test.com email to TEST_EMAILS recipients", () => {
    process.env.NODE_ENV = "production"
    process.env.TEST_EMAILS = "qa@example.com"
    clearEnv("TEST_EMAIL")

    const messages = createTestRoutedEmailMessages(
      createBaseMessage("owner@test.com"),
    )

    expect(messages.map((message) => message.to)).toEqual(["qa@example.com"])
    expect(messages[0]?.text).toContain("Original recipient: owner@test.com")
  })

  test("keeps production non-test email on the original recipient", () => {
    process.env.NODE_ENV = "production"
    clearEnv("TEST_EMAIL")
    clearEnv("TEST_EMAILS")

    const message = createBaseMessage("owner@example.com")

    expect(createTestRoutedEmailMessages(message)).toEqual([message])
  })

  test("does not route test.com subdomains", () => {
    process.env.NODE_ENV = "development"
    process.env.TEST_EMAILS = "qa@example.com"
    clearEnv("TEST_EMAIL")

    const message = createBaseMessage("owner@qa.test.com")

    expect(createTestRoutedEmailMessages(message)).toEqual([message])
  })

  test("uses TEST_EMAIL as a compatibility fallback", () => {
    process.env.NODE_ENV = "development"
    clearEnv("TEST_EMAILS")
    process.env.TEST_EMAIL = "fallback@example.com"

    const messages = createTestRoutedEmailMessages(
      createBaseMessage("owner@test.com"),
    )

    expect(messages.map((message) => message.to)).toEqual([
      "fallback@example.com",
    ])
  })

  test("requires a configured test inbox only when routing is required", () => {
    process.env.NODE_ENV = "production"
    clearEnv("TEST_EMAIL")
    clearEnv("TEST_EMAILS")

    expect(() =>
      createTestRoutedEmailMessages(createBaseMessage("owner@example.com")),
    ).not.toThrow()
    expect(() =>
      createTestRoutedEmailMessages(createBaseMessage("owner@test.com")),
    ).toThrow("TEST_EMAILS or TEST_EMAIL")

    process.env.NODE_ENV = "development"

    expect(() =>
      createTestRoutedEmailMessages(createBaseMessage("owner@example.com")),
    ).not.toThrow()
  })
})
