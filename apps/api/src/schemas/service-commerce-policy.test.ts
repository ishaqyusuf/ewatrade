import { describe, expect, test } from "bun:test"

import {
  serviceCommercePolicyDetailSchema,
  serviceCommercePolicyRevokeSchema,
  serviceCommercePolicySetSchema,
} from "./service-commerce-policy"

const valid = {
  approvalReference: "release-approval-1",
  channel: "whatsapp",
  effectiveAt: "2026-01-01T00:00:00.000Z",
  evidenceReference: "private-evidence-1",
  expectedRevision: 0,
  expiresAt: "2026-12-01T00:00:00.000Z",
  jurisdictionCode: "ng",
  outcome: "allowed",
  reason: "Written approval verified",
  storeId: "store-1",
  subject: "intake",
  vertical: "pharmacy",
}

describe("Service Commerce policy API schemas", () => {
  test("accepts a complete approved decision and normalizes its jurisdiction", () => {
    const result = serviceCommercePolicySetSchema.parse(valid)
    expect(result.jurisdictionCode).toBe("NG")
    expect(result.effectiveAt).toBeInstanceOf(Date)
  })

  test("rejects approval without private evidence, stale timestamps, and unknown fields", () => {
    expect(
      serviceCommercePolicySetSchema.safeParse({
        ...valid,
        evidenceReference: "",
      }).success,
    ).toBe(false)
    expect(
      serviceCommercePolicySetSchema.safeParse({
        ...valid,
        expiresAt: valid.effectiveAt,
      }).success,
    ).toBe(false)
    expect(
      serviceCommercePolicySetSchema.safeParse({ ...valid, untrusted: true })
        .success,
    ).toBe(false)
  })

  test("requires exact store and revision inputs for protected detail/revocation routes", () => {
    expect(
      serviceCommercePolicyDetailSchema.safeParse({ storeId: "store-1" })
        .success,
    ).toBe(false)
    expect(
      serviceCommercePolicyRevokeSchema.safeParse({
        decisionId: "decision-1",
        expectedRevision: 0,
        reason: "withdrawn",
        storeId: "store-1",
      }).success,
    ).toBe(false)
  })
})
