import { expect, test } from "bun:test"
import { renderAccountPrivacyOutcomeTemplate } from "@ewatrade/email"
import { createCallerFactory } from "../init"
import { accountPrivacyRouter } from "./account-privacy"

test("profile processing is platform-admin only and cannot accept a client retention policy", async () => {
  const previous = process.env.ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED
  process.env.ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED = "false"
  try {
    const caller = (isPlatformAdmin: boolean) =>
      createCallerFactory(accountPrivacyRouter)({
        db: {
          $transaction: () => {
            throw new Error("Database must not be touched")
          },
        },
        session: {
          session: { id: "session-1", token: "ordinary-session" },
          user: { id: "operator-1", isPlatformAdmin },
        },
      } as never)
    await expect(
      caller(false).processProfile({ requestId: "request-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      caller(true).processProfile({ requestId: "request-1" }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "DISABLED",
    })
    await expect(
      caller(true).processProfile({
        requestId: "request-1",
        policy: "erase",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(
        process.env,
        "ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED",
      )
    else process.env.ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED = previous
  }
})

test("maximum escaped outcome content reaches the disabled notice gate without database access", async () => {
  const previous = process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED
  process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED = "false"
  try {
    const content = { subject: '"'.repeat(180), text: '"'.repeat(16_000) }
    const template = renderAccountPrivacyOutcomeTemplate(content)
    expect(template.html.length).toBeGreaterThan(32_000)
    expect(template.html.length).toBeLessThanOrEqual(128_000)
    const caller = createCallerFactory(accountPrivacyRouter)({
      db: {
        $transaction: () => {
          throw new Error("Database must not be touched")
        },
      },
      session: {
        session: { id: "session-1", token: "ordinary-session" },
        user: { id: "operator-1", isPlatformAdmin: true },
      },
    } as never)
    await expect(
      caller.sendOutcomeNotice({
        requestId: "request-1",
        ...content,
        html: template.html,
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "DISABLED",
    })
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(
        process.env,
        "ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED",
      )
    else process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED = previous
  }
})

test("public external intake availability requires configuration and a trusted client source", async () => {
  const keys = [
    "ACCOUNT_PRIVACY_REQUESTS_ENABLED",
    "ACCOUNT_PRIVACY_OTP_SECRET",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EMAIL_DELIVERY_MODE",
    "EMAIL_CAPTURE_FILE",
  ] as const
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  )
  const caller = (privacyClientIp: string | null) =>
    createCallerFactory(accountPrivacyRouter)({
      db: {},
      privacyClientIp,
      session: null,
    } as never)
  try {
    process.env.ACCOUNT_PRIVACY_REQUESTS_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_OTP_SECRET = "a".repeat(32)
    process.env.RESEND_API_KEY = "test-mail-key"
    process.env.EMAIL_FROM = "test@example.invalid"
    process.env.EMAIL_DELIVERY_MODE = "live"
    Reflect.deleteProperty(process.env, "EMAIL_CAPTURE_FILE")
    expect(await caller("192.0.2.10").externalIntakeAvailability()).toEqual({
      available: true,
    })
    expect(await caller(null).externalIntakeAvailability()).toEqual({
      available: false,
    })
    process.env.ACCOUNT_PRIVACY_OTP_SECRET = "test-secret"
    expect(await caller("192.0.2.10").externalIntakeAvailability()).toEqual({
      available: false,
    })
    await expect(
      caller("192.0.2.10").requestExternalCode({
        email: "owner@example.com",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    process.env.ACCOUNT_PRIVACY_OTP_SECRET = " ".repeat(32)
    expect(await caller("192.0.2.10").externalIntakeAvailability()).toEqual({
      available: false,
    })
    process.env.ACCOUNT_PRIVACY_OTP_SECRET = "a".repeat(32)
    Reflect.deleteProperty(process.env, "RESEND_API_KEY")
    expect(await caller("192.0.2.10").externalIntakeAvailability()).toEqual({
      available: false,
    })
    process.env.RESEND_API_KEY = " "
    expect(await caller("192.0.2.10").externalIntakeAvailability()).toEqual({
      available: false,
    })
    process.env.RESEND_API_KEY = "test-mail-key"
    process.env.EMAIL_FROM = " "
    expect(await caller("192.0.2.10").externalIntakeAvailability()).toEqual({
      available: false,
    })
    process.env.EMAIL_FROM = "test@example.invalid"
    process.env.EMAIL_DELIVERY_MODE = "console"
    expect(await caller("192.0.2.10").externalIntakeAvailability()).toEqual({
      available: false,
    })
    process.env.EMAIL_DELIVERY_MODE = "live"
    process.env.EMAIL_CAPTURE_FILE = "/tmp/captured-mail.jsonl"
    expect(await caller("192.0.2.10").externalIntakeAvailability()).toEqual({
      available: false,
    })
    Reflect.deleteProperty(process.env, "EMAIL_CAPTURE_FILE")
    process.env.ACCOUNT_PRIVACY_REQUESTS_ENABLED = "false"
    expect(await caller("192.0.2.10").externalIntakeAvailability()).toEqual({
      available: false,
    })
  } finally {
    for (const key of keys) {
      const value = previous[key]
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})

test("external deletion never issues a challenge to an email routed into a QA inbox", async () => {
  const keys = [
    "ACCOUNT_PRIVACY_REQUESTS_ENABLED",
    "ACCOUNT_PRIVACY_OTP_SECRET",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EMAIL_DELIVERY_MODE",
    "EMAIL_CAPTURE_FILE",
    "EMAIL_QA_DOMAIN_ROUTES",
    "TEST_EMAIL",
    "TEST_EMAILS",
  ] as const
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  )
  let databaseCalls = 0
  const caller = createCallerFactory(accountPrivacyRouter)({
    db: {
      $transaction: async () => {
        databaseCalls += 1
        throw new Error("No challenge should be issued")
      },
    },
    privacyClientIp: "192.0.2.10",
    session: null,
  } as never)
  try {
    process.env.ACCOUNT_PRIVACY_REQUESTS_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_OTP_SECRET = "a".repeat(32)
    process.env.RESEND_API_KEY = "test-mail-key"
    process.env.EMAIL_FROM = "privacy@example.com"
    process.env.EMAIL_DELIVERY_MODE = "live"
    Reflect.deleteProperty(process.env, "EMAIL_CAPTURE_FILE")
    process.env.TEST_EMAIL = "qa@example.com"
    Reflect.deleteProperty(process.env, "TEST_EMAILS")
    process.env.EMAIL_QA_DOMAIN_ROUTES = JSON.stringify({
      "qa.example.test": "qa@example.com",
    })
    for (const email of ["owner@test.com", "owner@qa.example.test"]) {
      await expect(caller.requestExternalCode({ email })).rejects.toMatchObject(
        {
          code: "BAD_REQUEST",
        },
      )
    }
    expect(databaseCalls).toBe(0)
  } finally {
    for (const key of keys) {
      const value = previous[key]
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})

test("account access revocation remains disabled until processor operations are enabled", async () => {
  const previous = process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "false"
  try {
    const caller = createCallerFactory(accountPrivacyRouter)({
      db: {
        accountPrivacyRequest: {
          findUnique: async () => {
            throw new Error("No database read should occur")
          },
        },
      },
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "ordinary-session" },
        user: { id: "operator-1", isPlatformAdmin: true },
      },
    } as never)
    await expect(
      caller.revokeAccess({ requestId: "request-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  } finally {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = previous ?? ""
  }
})

test("tenant managers cannot start account-wide deletion review", async () => {
  const caller = createCallerFactory(accountPrivacyRouter)({
    db: {},
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "ordinary-session" },
      user: { id: "manager-1", isPlatformAdmin: false },
    },
  } as never)
  await expect(
    caller.beginReview({ requestId: "request-1" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("membership processing stays behind its separate switch", async () => {
  const previous = process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED
  process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = "false"
  try {
    const caller = createCallerFactory(accountPrivacyRouter)({
      db: {},
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "ordinary-session" },
        user: { id: "operator-1", isPlatformAdmin: true },
      },
    } as never)
    await expect(
      caller.revokeMembershipAccess({ requestId: "request-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  } finally {
    process.env.ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED = previous ?? ""
  }
})

test("tenant managers cannot invoke membership processing", async () => {
  const caller = createCallerFactory(accountPrivacyRouter)({
    db: {},
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "ordinary-session" },
      user: { id: "manager-1", isPlatformAdmin: false },
    },
  } as never)
  await expect(
    caller.revokeMembershipAccess({ requestId: "request-1" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("subscription no-data processing stays behind its separate switch", async () => {
  const previous = process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED
  process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED = "false"
  try {
    const caller = createCallerFactory(accountPrivacyRouter)({
      db: {},
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "ordinary-session" },
        user: { id: "operator-1", isPlatformAdmin: true },
      },
    } as never)
    await expect(
      caller.confirmNoSubscriptions({ requestId: "request-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  } finally {
    process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED = previous
  }
})

test("tenant managers cannot certify a no-subscription deletion outcome", async () => {
  const caller = createCallerFactory(accountPrivacyRouter)({
    db: {},
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "ordinary-session" },
      user: { id: "manager-1", isPlatformAdmin: false },
    },
  } as never)
  await expect(
    caller.confirmNoSubscriptions({ requestId: "request-1" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("conversation no-data processing stays behind its separate switch", async () => {
  const previous =
    process.env.ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED
  process.env.ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED = "false"
  try {
    const caller = createCallerFactory(accountPrivacyRouter)({
      db: {},
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "ordinary-session" },
        user: { id: "operator-1", isPlatformAdmin: true },
      },
    } as never)
    await expect(
      caller.confirmNoConversations({ requestId: "request-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(
        process.env,
        "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED",
      )
    else
      process.env.ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED =
        previous
  }
})

test("tenant managers cannot certify a no-conversation deletion outcome", async () => {
  const caller = createCallerFactory(accountPrivacyRouter)({
    db: {},
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "ordinary-session" },
      user: { id: "manager-1", isPlatformAdmin: false },
    },
  } as never)
  await expect(
    caller.confirmNoConversations({ requestId: "request-1" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("final account deletion completion stays behind its separate switch", async () => {
  const previous = process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED
  process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED = "false"
  try {
    const caller = createCallerFactory(accountPrivacyRouter)({
      db: {},
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "ordinary-session" },
        user: { id: "operator-1", isPlatformAdmin: true },
      },
    } as never)
    await expect(
      caller.completeRequest({ requestId: "request-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  } finally {
    process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED = previous
  }
})

test("tenant managers cannot complete an account deletion request", async () => {
  const caller = createCallerFactory(accountPrivacyRouter)({
    db: {},
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "ordinary-session" },
      user: { id: "manager-1", isPlatformAdmin: false },
    },
  } as never)
  await expect(
    caller.completeRequest({ requestId: "request-1" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("commercial no-data processing stays behind its separate switch", async () => {
  const previous = process.env.ACCOUNT_PRIVACY_COMMERCIAL_PROCESSING_ENABLED
  process.env.ACCOUNT_PRIVACY_COMMERCIAL_PROCESSING_ENABLED = "false"
  try {
    const caller = createCallerFactory(accountPrivacyRouter)({
      db: {},
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "ordinary-session" },
        user: { id: "operator-1", isPlatformAdmin: true },
      },
    } as never)
    await expect(
      caller.confirmNoCommercialRecords({ requestId: "request-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(
        process.env,
        "ACCOUNT_PRIVACY_COMMERCIAL_PROCESSING_ENABLED",
      )
    else process.env.ACCOUNT_PRIVACY_COMMERCIAL_PROCESSING_ENABLED = previous
  }
})

test("tenant managers cannot certify a no-commercial deletion outcome", async () => {
  const caller = createCallerFactory(accountPrivacyRouter)({
    db: {},
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "ordinary-session" },
      user: { id: "manager-1", isPlatformAdmin: false },
    },
  } as never)
  await expect(
    caller.confirmNoCommercialRecords({ requestId: "request-1" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("prescription no-data processing stays behind its separate switch", async () => {
  const previous = process.env.ACCOUNT_PRIVACY_PRESCRIPTION_PROCESSING_ENABLED
  process.env.ACCOUNT_PRIVACY_PRESCRIPTION_PROCESSING_ENABLED = "false"
  try {
    const caller = createCallerFactory(accountPrivacyRouter)({
      db: {},
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "ordinary-session" },
        user: { id: "operator-1", isPlatformAdmin: true },
      },
    } as never)
    await expect(
      caller.confirmNoPrescriptions({ requestId: "request-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(
        process.env,
        "ACCOUNT_PRIVACY_PRESCRIPTION_PROCESSING_ENABLED",
      )
    else process.env.ACCOUNT_PRIVACY_PRESCRIPTION_PROCESSING_ENABLED = previous
  }
})

test("tenant managers cannot certify a no-prescription deletion outcome", async () => {
  const caller = createCallerFactory(accountPrivacyRouter)({
    db: {},
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "ordinary-session" },
      user: { id: "manager-1", isPlatformAdmin: false },
    },
  } as never)
  await expect(
    caller.confirmNoPrescriptions({ requestId: "request-1" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
