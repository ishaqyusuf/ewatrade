import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_POLICY_OUTCOMES,
  SERVICE_COMMERCE_POLICY_SUBJECTS,
  SERVICE_COMMERCE_VERTICALS,
  evaluateServiceCommercePolicyFacts,
} from "./policy"

const now = new Date("2026-08-10T12:00:00.000Z")

function allowedFact(
  overrides: Partial<
    Parameters<typeof evaluateServiceCommercePolicyFacts>[0]["facts"][number]
  > = {},
) {
  return {
    approvalReferencePresent: true,
    channel: "staff" as const,
    effectiveAt: new Date("2026-08-09T00:00:00.000Z"),
    evidenceReferencePresent: true,
    expiresAt: new Date("2026-09-10T00:00:00.000Z"),
    jurisdictionCode: "NG",
    outcome: "allowed" as const,
    revision: 1,
    revokedAt: null,
    subject: "intake" as const,
    vertical: "service" as const,
    ...overrides,
  }
}

describe("Service Commerce vertical policy", () => {
  test("publishes an exhaustive vertical, subject and outcome vocabulary", () => {
    expect(SERVICE_COMMERCE_VERTICALS).toEqual(["service", "pharmacy"])
    expect(SERVICE_COMMERCE_POLICY_OUTCOMES).toEqual([
      "allowed",
      "restricted",
      "pending_evidence",
      "expired_approval",
      "prohibited",
    ])
    expect(SERVICE_COMMERCE_POLICY_SUBJECTS).toContain(
      "progressive_draft_capture",
    )
    expect(SERVICE_COMMERCE_POLICY_SUBJECTS).toContain("catalog_publication")
    expect(SERVICE_COMMERCE_POLICY_SUBJECTS).toContain("procure_to_order")
    expect(SERVICE_COMMERCE_POLICY_SUBJECTS).toContain("price_promotion")
    expect(SERVICE_COMMERCE_POLICY_SUBJECTS).toContain(
      "managed_inventory_graduation",
    )
  })

  test("fails missing and ambiguous jurisdiction or policy facts closed", () => {
    expect(
      evaluateServiceCommercePolicyFacts({
        channel: "staff",
        facts: [],
        jurisdictionCode: null,
        now,
        subject: "intake",
        vertical: "service",
      }),
    ).toMatchObject({
      outcome: "pending_evidence",
      reason: "jurisdiction_missing",
    })

    expect(
      evaluateServiceCommercePolicyFacts({
        channel: "staff",
        facts: [allowedFact(), allowedFact({ revision: 2 })],
        jurisdictionCode: "NG",
        now,
        subject: "intake",
        vertical: "service",
      }),
    ).toMatchObject({ outcome: "restricted", reason: "ambiguous_policy" })
  })

  test("derives pending, expired and revoked outcomes at the policy boundary", () => {
    expect(
      evaluateServiceCommercePolicyFacts({
        channel: "staff",
        facts: [
          allowedFact({ effectiveAt: new Date("2026-08-11T00:00:00.000Z") }),
        ],
        jurisdictionCode: "NG",
        now,
        subject: "intake",
        vertical: "service",
      }),
    ).toMatchObject({ outcome: "pending_evidence", reason: "not_effective" })
    expect(
      evaluateServiceCommercePolicyFacts({
        channel: "staff",
        facts: [allowedFact({ expiresAt: now })],
        jurisdictionCode: "NG",
        now,
        subject: "intake",
        vertical: "service",
      }),
    ).toMatchObject({ outcome: "expired_approval", reason: "approval_expired" })
    expect(
      evaluateServiceCommercePolicyFacts({
        channel: "staff",
        facts: [
          allowedFact({ revokedAt: new Date("2026-08-10T11:00:00.000Z") }),
        ],
        jurisdictionCode: "NG",
        now,
        subject: "intake",
        vertical: "service",
      }),
    ).toMatchObject({ outcome: "restricted", reason: "approval_revoked" })
  })

  test("keeps Nigeria Pharmacy WhatsApp prohibited without written approval", () => {
    const input = {
      channel: "whatsapp" as const,
      jurisdictionCode: "NG",
      now,
      subject: "intake" as const,
      vertical: "pharmacy" as const,
    }
    expect(
      evaluateServiceCommercePolicyFacts({ ...input, facts: [] }),
    ).toMatchObject({ outcome: "prohibited", reason: "prohibited_combination" })
    expect(
      evaluateServiceCommercePolicyFacts({
        ...input,
        facts: [
          allowedFact({
            approvalReferencePresent: false,
            channel: "whatsapp",
            vertical: "pharmacy",
          }),
        ],
      }),
    ).toMatchObject({
      outcome: "prohibited",
      reason: "written_approval_required",
    })
    expect(
      evaluateServiceCommercePolicyFacts({
        ...input,
        facts: [allowedFact({ channel: "whatsapp", vertical: "pharmacy" })],
      }),
    ).toMatchObject({ outcome: "allowed", reason: "policy_allowed" })
  })

  test("allows ordinary online service requests and tracking by default", () => {
    const evaluate = (
      overrides: Partial<
        Parameters<typeof evaluateServiceCommercePolicyFacts>[0]
      > = {},
    ) =>
      evaluateServiceCommercePolicyFacts({
        channel: "web",
        facts: [],
        jurisdictionCode: "NG",
        now,
        subject: "intake",
        vertical: "service",
        ...overrides,
      })
    for (const [channel, subject] of [
      ["staff", "web"],
      ["staff", "quote"],
      ["web", "intake"],
      ["web", "booking"],
      ["web", "quote"],
      ["web", "service_completion"],
    ] as const) {
      expect(evaluate({ channel, subject })).toMatchObject({
        outcome: "allowed",
        reason: "service_default_allowed",
      })
    }
    expect(evaluate({ channel: "whatsapp" }).outcome).toBe("pending_evidence")
    expect(evaluate({ vertical: "pharmacy" }).outcome).toBe("pending_evidence")
    expect(evaluate({ subject: "payment" }).outcome).toBe("pending_evidence")
    expect(evaluate({ jurisdictionCode: null }).reason).toBe(
      "jurisdiction_missing",
    )

    const webIntake = { channel: "web" as const, subject: "intake" as const }
    expect(
      evaluate({
        facts: [allowedFact({ ...webIntake, outcome: "restricted" })],
      }),
    ).toMatchObject({ outcome: "restricted", reason: "policy_restricted" })
    expect(
      evaluate({
        facts: [allowedFact({ ...webIntake, outcome: "prohibited" })],
      }).outcome,
    ).toBe("prohibited")
    expect(
      evaluate({ facts: [allowedFact({ ...webIntake, expiresAt: now })] }),
    ).toMatchObject({ outcome: "allowed", reason: "service_default_allowed" })
    expect(
      evaluate({
        facts: [
          allowedFact({
            ...webIntake,
            outcome: "restricted",
            revokedAt: new Date("2026-08-10T11:00:00.000Z"),
          }),
        ],
      }).reason,
    ).toBe("service_default_allowed")
    expect(evaluate({ facts: [allowedFact(webIntake)] })).toMatchObject({
      outcome: "allowed",
      policyRevision: 1,
      reason: "policy_allowed",
    })
  })

  test("keeps progressive Catalog operations independently decidable", () => {
    const facts = [
      allowedFact({ subject: "progressive_draft_capture" }),
      allowedFact({ outcome: "restricted", subject: "catalog_publication" }),
    ]
    const evaluate = (
      subject: "catalog_publication" | "progressive_draft_capture",
    ) =>
      evaluateServiceCommercePolicyFacts({
        channel: "staff",
        facts,
        jurisdictionCode: "NG",
        now,
        subject,
        vertical: "service",
      })
    expect(evaluate("progressive_draft_capture").outcome).toBe("allowed")
    expect(evaluate("catalog_publication").outcome).toBe("restricted")
  })
})
