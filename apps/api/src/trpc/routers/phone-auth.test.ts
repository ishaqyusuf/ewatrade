import { describe, expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { authRouter, requestPhoneOtpSchema, verifyPhoneOtpSchema } from "./auth"

describe("phone authentication API boundaries", () => {
  test("accepts international phone login without an email identity", () => {
    expect(
      requestPhoneOtpSchema.parse({ phone: "+2348000000000", mode: "login" }),
    ).toEqual({ phone: "+2348000000000", mode: "login" })
    for (const extra of [
      { email: "another@example.com" },
      { accessToken: "unrelated" },
      { userId: "another-user" },
    ]) {
      expect(
        requestPhoneOtpSchema.safeParse({
          phone: "+2348000000000",
          mode: "login",
          ...extra,
        }).success,
      ).toBe(false)
    }
    expect(
      requestPhoneOtpSchema.safeParse({ phone: "08000000000", mode: "login" })
        .success,
    ).toBe(false)
  })
  test("accepts a secondary business email without admitting an email identity", () => {
    const input = {
      phone: "+2348000000000",
      mode: "sign_up",
      ageBand: "ADULT",
      businessName: "Test business",
      requestedSlug: "test-business",
      contactEmail: " Contact@Example.com ",
    }
    expect(requestPhoneOtpSchema.parse(input).contactEmail).toBe(
      "contact@example.com",
    )
    expect(
      requestPhoneOtpSchema.safeParse({ ...input, contactEmail: "invalid" })
        .success,
    ).toBe(false)
    expect(
      requestPhoneOtpSchema.safeParse({
        ...input,
        email: "identity@example.com",
      }).success,
    ).toBe(false)
  })
  test("requires the existing age and business choices for phone signup", () => {
    expect(
      requestPhoneOtpSchema.safeParse({
        phone: "+2348000000000",
        mode: "sign_up",
      }).success,
    ).toBe(false)
    expect(
      requestPhoneOtpSchema.safeParse({
        phone: "+2348000000000",
        mode: "sign_up",
        ageBand: "ADULT",
        businessProfileKey: "laundry-dry-cleaning",
        businessProfileVersion: 1,
        operatingModel: "services",
        orderChannels: ["walk_in"],
        teamSize: "solo",
      }).success,
    ).toBe(true)
  })
  test("verification cannot alter the draft, declare consent or choose a user", () => {
    const input = { phone: "+2348000000000", mode: "login", code: "012345" }
    expect(verifyPhoneOtpSchema.safeParse(input).success).toBe(true)
    for (const extra of [
      { email: "another@example.com" },
      { name: "Changed" },
      { businessName: "Changed" },
      { ageBand: "ADULT" },
      { acceptedTerms: true },
    ])
      expect(
        verifyPhoneOtpSchema.safeParse({ ...input, ...extra }).success,
      ).toBe(false)
    expect(
      verifyPhoneOtpSchema.safeParse({ ...input, code: "12345" }).success,
    ).toBe(false)
  })
  test("disabled production phone authentication never accesses persistence", async () => {
    const keys = ["APP_ENV", "DEV_PROFILE", "WHATSAPP_OTP_ENABLED"] as const
    const saved = keys.map((key) => process.env[key])
    Object.assign(process.env, {
      APP_ENV: "production",
      DEV_PROFILE: "prod",
      WHATSAPP_OTP_ENABLED: "false",
    })
    try {
      const caller = createCallerFactory(authRouter)({
        db: new Proxy(
          {},
          {
            get() {
              throw new Error("Persistence must not run")
            },
          },
        ),
      } as never)
      expect(await caller.phoneOtpAvailability()).toEqual({ enabled: false })
      await expect(
        caller.requestPhoneOtp({ phone: "+2348000000000", mode: "login" }),
      ).rejects.toThrow("not available")
      await expect(
        caller.verifyPhoneOtp({
          phone: "+2348000000000",
          mode: "login",
          code: "123456",
        }),
      ).rejects.toThrow("not available")
    } finally {
      keys.forEach((key, index) => {
        if (saved[index] === undefined) delete process.env[key]
        else process.env[key] = saved[index]
      })
    }
  })
})
