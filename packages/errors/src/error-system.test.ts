import { describe, expect, test } from "bun:test"
import {
  AppError,
  classifyError,
  providerError,
  runProviderOperation,
  toPublicErrorEnvelope,
} from "."

describe("EwaTrade error contract", () => {
  test("onboarding recovery uses fixed public text through transport wrappers", () => {
    for (const code of [
      "ONBOARDING_APPROVAL_REQUIRED",
      "ONBOARDING_INVALID",
      "ONBOARDING_EXPIRED",
      "ONBOARDING_USED",
      "ONBOARDING_IDENTITY",
      "ONBOARDING_UNVERIFIED",
      "ONBOARDING_CONFLICT",
    ] as const) {
      const cause = new AppError({
        code,
        internalMessage: "private token ea_secret and recipient",
        cause: new Error("private provider credential"),
      })
      const response = toPublicErrorEnvelope(
        new Error("transport wrapper", { cause }),
      )
      expect(response.error.code).toBe(code)
      expect(response.error.message).toBe(cause.publicMessage)
      expect(JSON.stringify(response)).not.toContain("private")
      expect(JSON.stringify(response)).not.toContain("ea_secret")
      expect(classifyError(cause).reportable).toBe(false)
    }
  })

  test("explains the Catalog Terms gate through a wrapped error without leaking details", () => {
    const cause = Object.assign(new Error("private account detail"), {
      code: "CATALOG_TERMS_REQUIRED",
    })
    const response = toPublicErrorEnvelope(new Error("wrapper", { cause }))
    expect(response.error.code).toBe("CATALOG_TERMS_REQUIRED")
    expect(response.error.message).toContain("effective EwaTrade Terms")
    expect(response.error.retryable).toBe(false)
    expect(JSON.stringify(response)).not.toContain("private account detail")
    expect(classifyError(cause).reportable).toBe(false)
  })
  test("plan errors keep their server-authored upgrade text through wrappers", () => {
    const planError = Object.assign(
      new Error("Upgrade from Free to use finance."),
      {
        code: "PLAN_FEATURE_UNAVAILABLE",
        publicMessage: "Upgrade from Free to use finance.",
      },
    )
    const response = toPublicErrorEnvelope(
      new Error("tRPC wrapper", { cause: planError }),
    )
    expect(response.error).toMatchObject({
      code: "PLAN_UPGRADE_REQUIRED",
      message: "Upgrade from Free to use finance.",
      retryable: false,
    })
    expect(
      classifyError(
        Object.assign(new Error("limit"), {
          code: "ENTITLEMENT_LIMIT_REACHED",
        }),
      ).code,
    ).toBe("PLAN_LIMIT_REACHED")
    // Other codes never adopt a carried publicMessage.
    const leaky = Object.assign(new Error("private detail"), {
      code: "P2002",
      publicMessage: "private detail",
    })
    expect(toPublicErrorEnvelope(leaky).error.message).not.toContain("private")
  })

  test("suppresses expected offline and stock conflicts", () => {
    for (const code of [
      "OFFLINE_COMMAND_CONFLICT",
      "OFFLINE_REVIEW_REQUIRED",
      "STOCK_CONFLICT",
    ] as const) {
      expect(new AppError({ code }).reportable).toBe(false)
    }
  })

  test("classifies Prisma concurrency without message matching", () => {
    const original = Object.assign(new Error("private database detail"), {
      code: "P2034",
    })
    const first = classifyError(original)
    expect(first.code).toBe("DATABASE_WRITE_CONFLICT")
    expect(first).toBe(classifyError(original))
  })

  test("classifies nested provider and commerce causes structurally", () => {
    const registrar = Object.assign(new Error("private registrar body"), {
      code: "OPENPROVIDER_NETWORK_ERROR",
      name: "DomainProviderError",
      provider: "OPENPROVIDER",
    })
    expect(
      classifyError(new Error("tRPC wrapper", { cause: registrar })).code,
    ).toBe("REGISTRAR_PROVIDER_FAILED")
    expect(
      classifyError(
        Object.assign(new Error("stock detail"), {
          code: "INSUFFICIENT_STOCK",
        }),
      ).code,
    ).toBe("STOCK_CONFLICT")
    expect(
      classifyError(
        Object.assign(new Error("checkout detail"), {
          code: "PROVIDER_UNAVAILABLE",
        }),
      ).code,
    ).toBe("PAYMENT_PROVIDER_FAILED")
  })

  test("wraps providers without exposing provider bodies publicly", () => {
    const error = providerError(
      "payment",
      new Error("cardholder and provider response body"),
      "payments.capture",
    )
    expect(error.reportable).toBe(true)
    expect(JSON.stringify(toPublicErrorEnvelope(error))).not.toContain(
      "cardholder",
    )
  })

  test("wraps production provider operations at their call site", async () => {
    await expect(
      runProviderOperation("messaging", "messaging.send", () => {
        throw new Error("private provider response")
      }),
    ).rejects.toMatchObject({
      code: "MESSAGING_PROVIDER_FAILED",
      operation: "messaging.send",
      reportable: true,
    })
  })

  test("customer access failures collapse to a safe not-found response", () => {
    const response = toPublicErrorEnvelope(
      new AppError({ code: "CUSTOMER_ACCESS_DENIED" }),
      "req_public_01",
    )
    expect(response.error.code).toBe("CUSTOMER_ACCESS_DENIED")
    expect(response.error.message).not.toContain("token")
    expect(response.requestId).toBe("req_public_01")
  })
})

test("store allowance failures retain actionable copy through the API wrapper", () => {
  const response = toPublicErrorEnvelope(
    new Error("wrapper", {
      cause: new AppError({ code: "STORE_LIMIT_REACHED" }),
    }),
  )
  expect(response.error.code).toBe("STORE_LIMIT_REACHED")
  expect(response.error.message).toContain("store limit")
  expect(response.error.message).toContain("Upgrade your plan")
  expect(response.error.message).toContain("to add more stores")
  expect(response.error.message).not.toContain("permission")
  expect(response.error.retryable).toBe(false)
})
