import { expect, test } from "bun:test"
import { serviceBatchEligible } from "./service-batch-eligibility"
import {
  type ServiceChoice,
  quoteAmountMinor,
  serviceCartSummary,
} from "./service-intake-model"
import type { WorkJob } from "./service-utils"

const choices = [
  {
    id: "shirt",
    pricingPolicy: "fixed",
    fixedPriceMinor: 20000,
    serviceWorkPolicy: { quantityScale: 0 },
  },
  {
    id: "cleaning",
    pricingPolicy: "quote_required",
    fixedPriceMinor: null,
    serviceWorkPolicy: { quantityScale: 0 },
  },
] as unknown as ServiceChoice[]
test("unknown quote amounts are never a final zero-price total", () => {
  expect(
    serviceCartSummary(
      [
        { offeringId: "shirt", quantity: "2" },
        { offeringId: "cleaning", quantity: "1" },
      ],
      choices,
    ),
  ).toEqual({ totalMinor: 40000, unknown: 1, needsQuote: true, error: null })
  expect(
    serviceCartSummary(
      [
        { offeringId: "shirt", quantity: "2" },
        { offeringId: "cleaning", quantity: "1", quoteAmount: "25000" },
      ],
      choices,
    ),
  ).toMatchObject({
    totalMinor: 2540000,
    unknown: 0,
    needsQuote: true,
    error: null,
  })
})
test("money and exact quantity validation reject precision loss and invalid input", () => {
  expect(quoteAmountMinor("1.005")).toBeNull()
  expect(quoteAmountMinor("-1")).toBeNull()
  expect(quoteAmountMinor("0")).toBe(0)
  expect(quoteAmountMinor("15.25")).toBe(1525)
  expect(
    serviceCartSummary([{ offeringId: "shirt", quantity: "1.5" }], choices)
      .error,
  ).not.toBeNull()
  expect(
    serviceCartSummary([{ offeringId: "missing", quantity: "1" }], choices)
      .error,
  ).not.toBeNull()
})
test("batch status eligibility keeps gated, ready and finished work out of start/resume", () => {
  const job = (
    summary: string,
    status: string,
    authorizationStatus = "AUTHORIZED",
  ) =>
    ({
      summary,
      handedOffAt: null,
      lines: [{ status, authorizationStatus }],
    }) as unknown as WorkJob
  expect(
    serviceBatchEligible(job("queued", "QUEUED"), "mark_in_progress"),
  ).toBe(true)
  expect(
    serviceBatchEligible(
      job("queued", "QUEUED", "PENDING_PAYMENT"),
      "mark_in_progress",
    ),
  ).toBe(false)
  expect(
    serviceBatchEligible(
      job("ready_for_handoff", "READY_FOR_HANDOFF"),
      "mark_in_progress",
    ),
  ).toBe(false)
  expect(serviceBatchEligible(job("blocked", "BLOCKED"), "resume")).toBe(true)
  expect(
    serviceBatchEligible(job("in_progress", "IN_PROGRESS"), "mark_ready"),
  ).toBe(true)
  expect(serviceBatchEligible(job("completed", "COMPLETED"), "resume")).toBe(
    false,
  )
})
