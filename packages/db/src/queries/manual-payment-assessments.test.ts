import { expect, test } from "bun:test"
import { manualReceiptAssessmentProjection } from "./manual-payment-assessments"

const base = {
  state: "PENDING" as const,
  generation: 1,
  pipelineVersion: "manual-receipt-v3",
  completedAt: null,
  expiresAt: new Date(0),
  leaseExpiresAt: null,
  providerStartedAt: null,
  amountMinor: null,
  currencyCode: null,
  recipientLast4: null,
  unavailableReason: null,
  findings: null,
}
test("expired durable work projects manual fallback without mutating the queued record", () => {
  const projection = manualReceiptAssessmentProjection(base)
  expect(projection).toMatchObject({
    state: "unavailable",
    unavailableReason: "PROCESSING_UNAVAILABLE",
    fundsConfirmed: false,
  })
  expect(base.state).toBe("PENDING")
  expect(
    manualReceiptAssessmentProjection({
      ...base,
      state: "CHECKING",
      expiresAt: new Date(Date.now() + 60000),
      leaseExpiresAt: new Date(0),
      providerStartedAt: new Date(0),
    }),
  ).toMatchObject({
    state: "unavailable",
    unavailableReason: "PROVIDER_OUTCOME_UNKNOWN",
  })
})
test("public assessment projection strips private evidence/history and never confirms funds", () => {
  const projection = manualReceiptAssessmentProjection({
    ...base,
    state: "COMPLETE",
    findings: {
      disposition: "needs_review",
      findings: [
        {
          code: "RECIPIENT_MISMATCH",
          severity: "review",
          observed: "0012345678",
          expected: "0098765432",
          privateReportId: "merchant-only",
        },
      ],
    },
  })
  expect(projection?.findings).toEqual([
    { code: "RECIPIENT_MISMATCH", severity: "review" },
  ])
  expect(JSON.stringify(projection)).not.toContain("0012345678")
  expect(JSON.stringify(projection)).not.toContain("merchant-only")
  expect(projection?.fundsConfirmed).toBe(false)
})
