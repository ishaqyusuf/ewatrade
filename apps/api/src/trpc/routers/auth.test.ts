import { describe, expect, spyOn, test } from "bun:test"
import { auth } from "@ewatrade/auth"
import { createCallerFactory } from "../init"
import {
  authRouter,
  createMobileOwnerOtpEmailMessages,
  mobilePasswordSignInSchema,
  requestMobileOwnerOtpSchema,
  shouldDispatchMobileOwnerOtpEmail,
  verifyMobileGoogleSchema,
  verifyMobileOwnerOtpSchema,
} from "./auth"

test("unverified mobile password account never reaches Better Auth sign-in", async () => {
  const previousSecret = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = "test-mobile-password-secret"
  const rejectSignIn = Object.assign(
    async () => {
      throw new Error("Better Auth must not run for an unverified account")
    },
    {
      options: auth.api.signInEmail.options,
      path: auth.api.signInEmail.path,
    },
  )
  const signIn = spyOn(auth.api, "signInEmail").mockImplementation(rejectSignIn)
  const caller = createCallerFactory(authRouter)({
    db: {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          accountPrivacyRateBucket: {
            findUnique: async () => null,
            upsert: async () => ({}),
          },
        }),
      user: {
        findUnique: async () => ({ emailVerified: false }),
      },
    },
    requestHeaders: new Headers(),
    session: null,
  } as never)
  try {
    await expect(
      caller.signInMobilePassword({
        email: "unverified@example.test",
        password: "correct password",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(signIn).not.toHaveBeenCalled()
  } finally {
    signIn.mockRestore()
    if (previousSecret === undefined)
      Reflect.deleteProperty(process.env, "BETTER_AUTH_SECRET")
    else process.env.BETTER_AUTH_SECRET = previousSecret
  }
})

test("legacy undeclared Account cannot enumerate workspace access at startup", async () => {
  let accessReads = 0
  const caller = createCallerFactory(authRouter)({
    db: {
      user: { findUnique: async () => ({ ageBand: "UNDECLARED" }) },
      membership: {
        findFirst: async () => {
          accessReads += 1
          return null
        },
      },
      storeConversationAccountAccess: {
        findFirst: async () => {
          accessReads += 1
          return null
        },
      },
    },
    requestHeaders: new Headers(),
    session: { user: { id: "legacy-account" } },
  } as never)

  await expect(caller.getMobileAccessProfile()).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  })
  expect(accessReads).toBe(0)
})

function expectRejected(
  schema: { safeParse: (value: unknown) => unknown },
  value: unknown,
) {
  const result = schema.safeParse(value) as { success: boolean }

  expect(result.success).toBe(false)
}

const validSignupProfile = {
  ageBand: "AGE_13_TO_15" as const,
  businessProfileKey: "general-retail-groceries",
  businessProfileVersion: 1 as const,
  operatingModel: "products" as const,
  orderChannels: ["walk_in"] as ["walk_in"],
  teamSize: "solo" as const,
}

describe("mobile auth router schemas", () => {
  test("requires a 13+ choice for signup but not login", () => {
    expectRejected(requestMobileOwnerOtpSchema, {
      email: "new@example.test",
      mode: "sign_up",
      ...validSignupProfile,
      ageBand: undefined,
    })
    expectRejected(verifyMobileGoogleSchema, {
      idToken: "google-id-token-with-enough-length",
      mode: "sign_up",
      ...validSignupProfile,
      ageBand: "UNDER_13",
    })
    expect(
      requestMobileOwnerOtpSchema.safeParse({
        email: "existing@example.test",
        mode: "login",
      }).success,
    ).toBe(true)
  })

  test("accepts only bounded email/password mobile sign-in input", () => {
    expect(
      mobilePasswordSignInSchema.parse({
        email: " REVIEWER@EXAMPLE.TEST ",
        password: "correct horse battery staple",
      }),
    ).toEqual({
      email: "reviewer@example.test",
      password: "correct horse battery staple",
    })
    expectRejected(mobilePasswordSignInSchema, {
      email: "reviewer@example.test",
      password: "",
    })
    expectRejected(mobilePasswordSignInSchema, {
      email: "reviewer@example.test",
      password: "secret",
      tenantId: "other-business",
    })
  })

  test("normalizes lightweight owner email OTP signup payloads", () => {
    const input = requestMobileOwnerOtpSchema.parse({
      ageBand: "AGE_13_TO_15",
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
      ageBand: "AGE_13_TO_15",
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

  test("mobile signup inputs carry bounded separate legal choices", () => {
    const legal = {
      legalVersion: "2026-10-01",
      acceptedTerms: true,
      acknowledgedPrivacyNotice: true,
    }
    expect(
      requestMobileOwnerOtpSchema.parse({
        ...validSignupProfile,
        ...legal,
        email: "owner@business.test",
        mode: "sign_up",
      }),
    ).toMatchObject(legal)
    expect(
      verifyMobileGoogleSchema.parse({
        ...validSignupProfile,
        ...legal,
        idToken: "google-id-token-with-enough-length",
        mode: "sign_up",
      }),
    ).toMatchObject(legal)
    expectRejected(requestMobileOwnerOtpSchema, {
      ...validSignupProfile,
      ...legal,
      acceptedTerms: false,
      email: "owner@business.test",
      mode: "sign_up",
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

test("ordinary mobile bootstrap retains business and linked customer access", async () => {
  const caller = createCallerFactory(authRouter)({
    db: {
      user: { findUnique: async () => ({ ageBand: "ADULT" }) },
      membership: {
        findFirst: async () => ({
          role: "OWNER",
          status: "ACTIVE",
          tenant: {
            id: "business",
            name: "Business",
            slug: "business",
            currencyCode: "NGN",
            stores: [
              {
                id: "store",
                name: "Store",
                currencyCode: "NGN",
                status: "ACTIVE",
              },
            ],
          },
        }),
      },
      storeConversationAccountAccess: {
        findFirst: async () => ({ id: "customer-link" }),
      },
    },
    requestHeaders: new Headers(),
    session: { user: { id: "ordinary-user" } },
    qaSessionScope: null,
  } as never)
  expect(await caller.getMobileAccessProfile()).toEqual({
    hasBusinessAccess: true,
    hasCustomerHistory: true,
  })
})

describe("mobile bootstrap for scoped QA sessions", () => {
  const scope = {
    membershipId: "qa-membership",
    tenantId: "qa-tenant",
    storeId: "qa-store",
  }
  function callerFor(
    options: {
      eligible?: boolean
      membership?: boolean
      session?: boolean
    } = {},
  ) {
    const reads: unknown[] = []
    const caller = createCallerFactory(authRouter)({
      db: {
        user: {
          findUnique: async () => ({
            ageBand: options.eligible === false ? "UNDECLARED" : "ADULT",
          }),
        },
        membership: {
          findFirst: async (query: unknown) => {
            reads.push(query)
            return options.membership === false
              ? null
              : { id: scope.membershipId }
          },
        },
        storeConversationAccountAccess: {
          findFirst: async () => {
            throw new Error("QA bootstrap must not enumerate customer history")
          },
        },
      },
      requestHeaders: new Headers(),
      session: options.session === false ? null : { user: { id: "qa-user" } },
      qaSessionScope: scope,
    } as never)
    return { caller, reads }
  }
  test("opens only its validated business shell without global enumeration", async () => {
    const { caller, reads } = callerFor()
    expect(await caller.getMobileAccessProfile()).toEqual({
      hasBusinessAccess: true,
      hasCustomerHistory: false,
    })
    expect(reads).toEqual([
      {
        where: {
          id: scope.membershipId,
          userId: "qa-user",
          status: "ACTIVE",
          tenant: {
            id: scope.tenantId,
            dataClassification: "QA",
            isActive: true,
            qaPurgeStartedAt: null,
            stores: { some: { id: scope.storeId, status: "ACTIVE" } },
          },
        },
        select: { id: true },
      },
    ])
  })
  test("denies a missing or inactive scoped membership", async () => {
    await expect(
      callerFor({ membership: false }).caller.getMobileAccessProfile(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
  test("preserves the age prerequisite before scope reads", async () => {
    const { caller, reads } = callerFor({ eligible: false })
    await expect(caller.getMobileAccessProfile()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    })
    expect(reads).toEqual([])
  })
  test("denies an absent or invalidated session before any scope reads", async () => {
    const { caller, reads } = callerFor({ session: false })
    await expect(caller.getMobileAccessProfile()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    expect(reads).toEqual([])
  })
})
