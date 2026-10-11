import { expect, test } from "bun:test"
import { z } from "zod"
import {
  generalCustomerEntryInput,
  generalCustomerAllocationHistoryInput,
  generalCustomerAllocationHistoryAnswer,
} from "./general-customer-allocations"
test("allocation lookups preserve strict bounded revision-pinned continuation", () => {
  expect(z.toJSONSchema(generalCustomerEntryInput).type).toBe("object")
  expect(
    generalCustomerEntryInput.parse({ accountId: "a", entryId: "e" }).limit,
  ).toBe(10)
  expect(
    generalCustomerEntryInput.safeParse({
      accountId: "a",
      entryId: "e",
      afterAllocationId: "x",
    }).success,
  ).toBe(false)
  expect(
    generalCustomerEntryInput.safeParse({
      accountId: "a",
      entryId: "e",
      afterAllocationId: "x",
      expectedRevision: "3",
    }).success,
  ).toBe(true)
  expect(
    generalCustomerAllocationHistoryInput.safeParse({
      accountId: "a",
      allocationId: "x",
    }).success,
  ).toBe(false)
  for (const extra of [{ limit: 50 }, { tenantId: "other" }])
    expect(
      generalCustomerAllocationHistoryInput.safeParse({
        accountId: "a",
        allocationId: "x",
        expectedRevision: "3",
        ...extra,
      }).success,
    ).toBe(false)
})
test("allocation answer labels complete totals separately from the release page", () => {
  const page = {
    accountId: "a",
    currencyCode: "NGN",
    currentRevision: "3",
    allocation: {
      id: "x",
      amountMinor: "300",
      sequence: "1",
      creditEntryId: "credit",
      chargeEntryId: "debt",
      actorUserId: "qa",
      createdAt: new Date(),
    },
    releasedAmountMinor: "100",
    remainingAmountMinor: "200",
    reconciliationRequired: false,
    releases: [],
    nextCursor: "4",
    coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES" as const,
    completeness: "INCOMPLETE_SOURCE_COVERAGE" as const,
  }
  const answer = generalCustomerAllocationHistoryAnswer(page)
  expect(answer.value).toContain("2.00")
  expect(answer.detail).toContain("Totals include all releases")
  expect(answer.detail).toContain("More releases available")
  expect(answer.detail).toContain("not a monetary refund")
  expect(
    generalCustomerAllocationHistoryAnswer({
      ...page,
      reconciliationRequired: true,
    }).detail,
  ).toContain("Reconciliation required")
})
