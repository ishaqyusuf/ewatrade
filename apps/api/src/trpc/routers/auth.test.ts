import { describe, expect, test } from "bun:test"
import {
  requestMobileOwnerOtpSchema,
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
      businessName: " Rice Store ",
      email: " OWNER@BUSINESS.TEST ",
      mode: "sign_up",
      name: " Store Owner ",
    })

    expect(input).toEqual({
      businessName: "Rice Store",
      email: "owner@business.test",
      mode: "sign_up",
      name: "Store Owner",
    })
  })

  test("normalizes owner OTP verification payloads", () => {
    const input = verifyMobileOwnerOtpSchema.parse({
      businessName: " Rice Store ",
      code: " 123456 ",
      email: " OWNER@BUSINESS.TEST ",
      mode: "login",
      name: " Store Owner ",
    })

    expect(input).toEqual({
      businessName: "Rice Store",
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
      email: "owner@business.test",
      mode: "sign_up",
      name: "Store Owner",
      password: "not-for-the-mvp",
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
})
