import { describe, expect, test } from "bun:test"
import {
  createMobileOwnerOtpEmailMessages,
  requestMobileOwnerOtpSchema,
  shouldDispatchMobileOwnerOtpEmail,
  verifyMobileGoogleSchema,
  verifyMobileOwnerOtpSchema,
} from "./auth"

function expectRejected(
  schema: { safeParse: (value: unknown) => unknown },
  value: unknown,
) {
  const result = schema.safeParse(value) as { success: boolean }

  expect(result.success).toBe(false)
}

describe("mobile auth router schemas", () => {
  test("normalizes lightweight owner email OTP signup payloads", () => {
    const input = requestMobileOwnerOtpSchema.parse({
      businessProfileKey: " animal-feed-agricultural-supplies ",
      businessProfileVersion: 1,
      businessName: " Rice Store ",
      currencyCode: "GHS",
      email: " OWNER@BUSINESS.TEST ",
      mode: "sign_up",
      name: " Store Owner ",
      operatingModel: "products",
      orderChannels: ["walk_in", "phone_whatsapp"],
      teamSize: "2_5",
    })

    expect(input).toEqual({
      businessProfileKey: "animal-feed-agricultural-supplies",
      businessProfileVersion: 1,
      businessName: "Rice Store",
      currencyCode: "GHS",
      email: "owner@business.test",
      mode: "sign_up",
      name: "Store Owner",
      operatingModel: "products",
      orderChannels: ["walk_in", "phone_whatsapp"],
      teamSize: "2_5",
    })
  })

  test("normalizes owner OTP verification payloads", () => {
    const input = verifyMobileOwnerOtpSchema.parse({
      businessName: " Rice Store ",
      currencyCode: "KES",
      code: " 123456 ",
      email: " OWNER@BUSINESS.TEST ",
      mode: "login",
      name: " Store Owner ",
    })

    expect(input).toEqual({
      businessName: "Rice Store",
      currencyCode: "KES",
      code: "123456",
      email: "owner@business.test",
      mode: "login",
      name: "Store Owner",
    })
  })

  test("normalizes Google identity verification payloads", () => {
    const input = verifyMobileGoogleSchema.parse({
      businessName: " Rice Store ",
      idToken: " google-id-token-with-enough-length ",
      mode: "sign_up",
      name: " Store Owner ",
    })

    expect(input).toEqual({
      businessName: "Rice Store",
      idToken: "google-id-token-with-enough-length",
      mode: "sign_up",
      name: "Store Owner",
    })
  })

  test("rejects bulky or unsafe owner auth payloads", () => {
    expectRejected(requestMobileOwnerOtpSchema, {
      businessName: "Rice Store",
      currencyCode: "XOF",
      email: "owner@business.test",
      mode: "sign_up",
    })
    expectRejected(requestMobileOwnerOtpSchema, {
      businessName: "Rice Store",
      email: "owner@business.test",
      mode: "sign_up",
      name: "Store Owner",
      password: "not-for-the-mvp",
    })
    expectRejected(requestMobileOwnerOtpSchema, {
      businessName: "Rice Store",
      businessProfileKey: "unsupported-industry",
      email: "owner@business.test",
      mode: "sign_up",
    })
    expectRejected(requestMobileOwnerOtpSchema, {
      email: "owner@business.test",
      mode: "register",
    })
    expectRejected(verifyMobileOwnerOtpSchema, {
      code: "12345",
      email: "owner@business.test",
      mode: "login",
    })
    expectRejected(verifyMobileOwnerOtpSchema, {
      code: "1234567",
      email: "owner@business.test",
      mode: "login",
    })
    expectRejected(verifyMobileOwnerOtpSchema, {
      code: "ABC123",
      email: "owner@business.test",
      mode: "login",
    })
    expectRejected(verifyMobileGoogleSchema, {
      idToken: "short",
      mode: "login",
    })
    expectRejected(verifyMobileGoogleSchema, {
      idToken: "google-id-token-with-enough-length",
      mode: "register",
    })
  })

  test("routes mobile OTP email to test inboxes without changing the identity email", () => {
    const input = requestMobileOwnerOtpSchema.parse({
      businessName: " Rice Store ",
      email: " OWNER@TEST.COM ",
      mode: "sign_up",
      name: " Store Owner ",
    })
    const messages = createMobileOwnerOtpEmailMessages({
      code: "123456",
      email: input.email,
      env: {
        NODE_ENV: "production",
        TEST_EMAILS: "qa-one@example.com, qa-two@example.com",
      },
      expiresAt: new Date("2026-07-13T12:00:00.000Z"),
      mode: input.mode,
    })

    expect(input.email).toBe("owner@test.com")
    expect(messages.map((message) => message.to)).toEqual([
      "qa-one@example.com",
      "qa-two@example.com",
    ])
    expect(
      messages.every((message) =>
        message.text.includes("Original recipient: owner@test.com"),
      ),
    ).toBe(true)
    expect(messages.every((message) => message.text.includes("123456"))).toBe(
      true,
    )
  })

  test("dispatches OTP email only in production", () => {
    expect(shouldDispatchMobileOwnerOtpEmail({ NODE_ENV: "production" })).toBe(
      true,
    )
    expect(shouldDispatchMobileOwnerOtpEmail({ NODE_ENV: "development" })).toBe(
      false,
    )
    expect(shouldDispatchMobileOwnerOtpEmail({ NODE_ENV: "test" })).toBe(false)
    expect(shouldDispatchMobileOwnerOtpEmail({})).toBe(false)
  })
})
