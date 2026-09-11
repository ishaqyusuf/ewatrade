import { describe, expect, test } from "bun:test"
import {
  QaProviderPolicyError,
  assertQaProviderAllowed,
  evaluateQaProviderPolicy,
} from "./qa-provider-policy"

describe("QA provider policy", () => {
  test("allows ordinary LIVE tenant operations", () => {
    expect(
      evaluateQaProviderPolicy({
        adapter: "live",
        operation: "payment",
        tenantDataClassification: "LIVE",
      }),
    ).toEqual({ allowed: true, receiptKind: "live" })
  })

  test("allows routed QA email and registered test adapters", () => {
    expect(
      evaluateQaProviderPolicy({
        operation: "email",
        qaEmailRouted: true,
        tenantDataClassification: "QA",
      }),
    ).toEqual({ allowed: true, receiptKind: "qa_routed_email" })
    expect(
      evaluateQaProviderPolicy({
        adapter: "test",
        operation: "whatsapp",
        tenantDataClassification: "QA",
      }),
    ).toEqual({ allowed: true, receiptKind: "test_adapter" })
  })

  test("blocks QA live effects before a provider can run", () => {
    let providerCalls = 0
    expect(() => {
      assertQaProviderAllowed({
        adapter: "live",
        operation: "sms",
        tenantDataClassification: "QA",
      })
      providerCalls += 1
    }).toThrow(QaProviderPolicyError)
    expect(providerCalls).toBe(0)
  })
})
