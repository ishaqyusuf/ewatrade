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

const validSignupProfile = {
  businessProfileKey: "general-retail-groceries",
  businessProfileVersion: 1 as const,
  operatingModel: "products" as const,
  orderChannels: ["walk_in"] as ["walk_in"],
  teamSize: "solo" as const,
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

  test("accepts an empty optional business description during signup verification", () => {
    const input = verifyMobileOwnerOtpSchema.parse({
      ...validSignupProfile,
      addressLine1: "Ojagboro",
      businessName: "Jawdah",
      city: "Ilorin",
      code: "123456",
      currencyCode: "NGN",
      email: "jawdah@ishaq.qa.test",
      mode: "sign_up",
      name: "Ishaq Yusuf",
      otherBusinessDescription: "",
      phone: "08186877306",
    })

    expect(input.otherBusinessDescription).toBe("")
  })

  test("normalizes Google identity verification payloads", () => {
    const input = verifyMobileGoogleSchema.parse({
      ...validSignupProfile,
      businessName: " Rice Store ",
      idToken: " google-id-token-with-enough-length ",
      mode: "sign_up",
      name: " Store Owner ",
    })

    expect(input).toEqual({
      ...validSignupProfile,
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
    expectRejected(requestMobileOwnerOtpSchema, {
      businessName: "Rice Store",
      email: "owner@business.test",
      mode: "sign_up",
      name: "Store Owner",
    })
    expectRejected(requestMobileOwnerOtpSchema, {
      ...validSignupProfile,
      businessProfileKey: "other-mixed-business",
      businessName: "Rice Store",
      email: "owner@business.test",
      mode: "sign_up",
      name: "Store Owner",
    })
  })

  test("routes mobile OTP email by QA domain without changing the identity email", () => {
    const input = requestMobileOwnerOtpSchema.parse({
      ...validSignupProfile,
      businessName: " Rice Store ",
      email: " OWNER@ISHAQ.QA.TEST ",
      mode: "sign_up",
      name: " Store Owner ",
    })
    const messages = createMobileOwnerOtpEmailMessages({
      code: "123456",
      email: input.email,
      env: {
        EMAIL_QA_DOMAIN_ROUTES: JSON.stringify({
          "ishaq.qa.test": "ishaq@example.com",
        }),
        NODE_ENV: "production",
      },
      expiresAt: new Date("2026-07-13T12:00:00.000Z"),
      mode: input.mode,
    })

    expect(input.email).toBe("owner@ishaq.qa.test")
    expect(messages.map((message) => message.to)).toEqual(["ishaq@example.com"])
    expect(
      messages.every((message) =>
        message.text.includes("Original recipient: owner@ishaq.qa.test"),
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
    expect(
      shouldDispatchMobileOwnerOtpEmail({
        APP_ENV: "production",
        NODE_ENV: "development",
      }),
    ).toBe(true)
    expect(shouldDispatchMobileOwnerOtpEmail({ NODE_ENV: "development" })).toBe(
      false,
    )
    expect(shouldDispatchMobileOwnerOtpEmail({ NODE_ENV: "test" })).toBe(false)
    expect(shouldDispatchMobileOwnerOtpEmail({})).toBe(false)
  })
})
