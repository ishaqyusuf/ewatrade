// Isolated coordinator diagnostics for the current unintegrated S05 implementation packet.
// Run explicitly with that packet present; not a clean-main or default-suite test.
// Canonical-shaped input; no database or model.
import { generalStaffActivityAnswer } from "../../../../apps/api/src/assistant/general-staff-activity"

type Page = Parameters<typeof generalStaffActivityAnswer>[0]
const period = {
  from: "2026-10-12T00:00:00+01:00",
  to: "2026-10-13T00:00:00+01:00",
}
const event: Page["data"][number] = {
  id: "review-payment",
  at: "2026-10-12T13:05:00.000Z",
  stream: "PAYMENT",
  relation: "PERFORMED",
  actor: {
    coverage: "available",
    membershipId: "review-member",
    userId: "review-user",
    name: "Amina",
  },
  store: { id: "review-store", name: "Wuse" },
  record: {
    kind: "payment",
    id: "review-payment",
    orderId: "review-order",
    label: "ORD-REVIEW",
  },
  outcome: "Payment recorded",
  amount: null,
}
const page: Page = {
  data: Array.from({ length: 10 }, (_, index) => ({
    ...event,
    id: `review-${index}`,
    record: { ...event.record, label: `ORD-${index}` },
  })),
  total: 14,
  byStream: { PAYMENT: 14 },
  nextCursor: "review-next",
  asOf: "2026-10-12T15:00:00.000Z",
  period,
  scope: "business",
  coverage: {
    streams: ["PAYMENT"],
    excluded: [],
    unknownActors: false,
    notIncluded: [
      "finance_actions",
      "sign_in_and_device_activity",
      "attendance_and_payroll",
    ],
    detail: "Synthetic review input.",
  },
}
const normal = generalStaffActivityAnswer(page, period)
if (!page.data.every((row) => normal.detail.includes(row.record.label)))
  throw new Error("Normal ten-label control failed")
const longOutcome = generalStaffActivityAnswer(
  {
    ...page,
    data: page.data.map((row) => ({ ...row, outcome: "x".repeat(400) })),
  },
  period,
)
if (
  !longOutcome.detail.includes("The total counts every matching record") ||
  longOutcome.detail.length > 1000
)
  throw new Error("Repaired outcome/count control failed")
const unknown = generalStaffActivityAnswer(
  {
    ...page,
    data: [
      {
        ...event,
        actor: {
          coverage: "unknown",
          membershipId: null,
          userId: null,
          name: null,
        },
      },
    ],
    coverage: { ...page.coverage, unknownActors: true },
  },
  period,
)
if (
  !unknown.detail.includes("Unknown (not recorded)") ||
  unknown.detail.includes("Only actions recorded with a person")
)
  throw new Error("Repaired unknown-actor control failed")
console.log(
  JSON.stringify({ probe: "original three repaired controls", result: "pass" }),
)
const longLabels = page.data.map((row, index) => ({
  ...row,
  stream: "PRICE_CHANGE" as const,
  store: null,
  outcome: "Price set",
  record: {
    kind: "product" as const,
    id: `review-product-${index}`,
    offeringId: `review-offering-${index}`,
    label: `Product ${"x".repeat(90)} unique-${index}`,
  },
}))
const answer = generalStaffActivityAnswer(
  {
    ...page,
    data: longLabels,
    byStream: { PRICE_CHANGE: 14 },
    coverage: { ...page.coverage, streams: ["PRICE_CHANGE"] },
  },
  period,
)
console.log(
  JSON.stringify({
    probe: "distinct long canonical record labels",
    shown: longLabels.length,
    missingUniqueLabelSuffixes: longLabels
      .map((_, index) => `unique-${index}`)
      .filter((label) => !answer.detail.includes(label)),
    detailLength: answer.detail.length,
  }),
)
console.log(
  JSON.stringify({
    probe: "finance coverage exclusion in saved answer",
    inputExclusions: page.coverage.notIncluded,
    answerDisclosesFinanceExclusion:
      /finance|journal|bill|money movement/i.test(normal.detail),
  }),
)
