import { describe, expect, test } from "bun:test"
import {
  AppError,
  classifyError,
  providerError,
  runProviderOperation,
  toPublicErrorEnvelope,
} from "."

describe("EwaTrade error contract", () => {
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
