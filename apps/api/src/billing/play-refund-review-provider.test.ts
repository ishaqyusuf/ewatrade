import { expect, test } from "bun:test"
import {
  getPlayRefundReviewAccessToken,
  sendPlayRefundReviewRecommendation,
} from "./play-refund-review-provider"

const enabled = {
  PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
  STORE_BILLING_ENVIRONMENT: "sandbox",
  APP_ENV: "local",
  PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "sandbox-refund-review-v1",
  PLAY_PACKAGE_NAME: "com.ewatrade.app",
}

const request = {
  orderId: "GPA.1234-5678",
  pendingRefundToken: "sensitive-pending-token",
  preference: "NEUTRAL" as const,
  sampleContentProvided: false,
}

test("Play review transport refuses disabled and production profiles before credential access", async () => {
  let credentialsRead = 0
  const transport = {
    accessToken: async () => {
      credentialsRead++
      return "access-token"
    },
    send: async () => ({ ok: true }),
  }
  for (const env of [
    { ...enabled, PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "false" },
    { ...enabled, STORE_BILLING_ENVIRONMENT: "production" },
    { ...enabled, APP_ENV: "production" },
    { ...enabled, PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "" },
    {
      ...enabled,
      APP_ENV: "production",
      DEV_PROFILE: "prod",
      STORE_BILLING_ENVIRONMENT: "production",
    },
    { ...enabled, PLAY_PACKAGE_NAME: "another.app" },
  ]) {
    await expect(
      sendPlayRefundReviewRecommendation(request, { env, transport }),
    ).rejects.toThrow()
  }
  expect(credentialsRead).toBe(0)
})

test("explicitly enabled Production transport makes one mocked request", async () => {
  const env = {
    ...enabled,
    APP_ENV: "production",
    DEV_PROFILE: "prod",
    STORE_BILLING_ENVIRONMENT: "production",
    PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED: "true",
  }
  let attempts = 0
  const result = await sendPlayRefundReviewRecommendation(request, {
    env,
    accessToken: "test-token",
    transport: {
      accessToken: async () => {
        throw new Error("unexpected credential read")
      },
      send: async () => {
        attempts++
        return { ok: true }
      },
    },
  })
  expect(result).toBe("CONFIRMED")
  expect(attempts).toBe(1)
})

test("publisher authorization refuses disabled profiles and absent tokens before claim", async () => {
  let reads = 0
  await expect(
    getPlayRefundReviewAccessToken({
      env: { ...enabled, APP_ENV: "production" },
      accessToken: async () => {
        reads++
        return "token"
      },
    }),
  ).rejects.toThrow("unavailable")
  expect(reads).toBe(0)
  await expect(
    getPlayRefundReviewAccessToken({
      env: enabled,
      accessToken: async () => {
        reads++
        return null
      },
    }),
  ).rejects.toThrow("unavailable")
  expect(reads).toBe(1)
})

test("Play review transport sends one exact first-response payload", async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const result = await sendPlayRefundReviewRecommendation(request, {
    env: enabled,
    transport: {
      accessToken: async () => "access-token",
      send: async (url, init) => {
        calls.push({ url, init })
        return { ok: true }
      },
    },
  })
  expect(result).toBe("CONFIRMED")
  expect(calls).toHaveLength(1)
  expect(calls[0]?.url).toBe(
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.ewatrade.app/orders/GPA.1234-5678:reviewrefund",
  )
  expect(calls[0]?.init.method).toBe("POST")
  expect(calls[0]?.init.redirect).toBe("error")
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
    pendingRefundToken: request.pendingRefundToken,
    sampleContentProvided: false,
    refundPreference: "NEUTRAL",
  })
})

test("pre-acquired publisher token is reused for the only HTTP attempt", async () => {
  let credentialReads = 0
  let authorization = ""
  const accessToken = await getPlayRefundReviewAccessToken({
    env: enabled,
    accessToken: async () => {
      credentialReads++
      return "pre-acquired-token"
    },
  })
  const outcome = await sendPlayRefundReviewRecommendation(request, {
    env: enabled,
    accessToken,
    transport: {
      accessToken: async () => {
        credentialReads++
        return "unexpected-second-token"
      },
      send: async (_url, init) => {
        authorization = String(
          (init.headers as Record<string, string>).Authorization,
        )
        return { ok: true }
      },
    },
  })
  expect(outcome).toBe("CONFIRMED")
  expect(credentialReads).toBe(1)
  expect(authorization).toBe("Bearer pre-acquired-token")
})

test("Play review transport marks uncertain outcomes without retrying or exposing provider errors", async () => {
  for (const send of [
    async () => ({ ok: false }),
    async () => {
      throw new Error(`provider echoed ${request.pendingRefundToken}`)
    },
  ]) {
    let attempts = 0
    const result = await sendPlayRefundReviewRecommendation(request, {
      env: enabled,
      transport: {
        accessToken: async () => "access-token",
        send: async () => {
          attempts++
          return send()
        },
      },
    })
    expect(result).toBe("UNCERTAIN")
    expect(attempts).toBe(1)
  }
})
