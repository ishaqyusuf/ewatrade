import { describe, expect, test } from "bun:test"
import {
  type BusinessReportTarget,
  businessReportTargetSchema,
  customerDebtReportInput,
  itemSalesReportInput,
  postedProfitReportInput,
  stockReportInput,
  supplierAgingReportInput,
} from "./business-report-target"
const period = {
  from: "2026-10-11T00:00:00+01:00",
  before: "2026-10-12T00:00:00+01:00",
  timezone: "Africa/Lagos",
  currencyCode: "NGN",
}
describe("G01 reporting boundaries", () => {
  test("explicit offset period is accepted; unknown timezone and empty/backwards/oversized periods fail", () => {
    expect(itemSalesReportInput.parse(period)).toEqual(period)
    for (const change of [
      { timezone: "Mars/Unknown" },
      { before: period.from },
      { before: "2026-10-10T00:00:00Z" },
      { before: "2028-10-12T00:00:00Z" },
      { currencyCode: "ngn" },
      { from: "2026-10-11" },
    ])
      expect(
        itemSalesReportInput.safeParse({ ...period, ...change }).success,
      ).toBe(false)
  })
  test("snapshot inputs refuse historical, Store, actor and arbitrary URL authority", () => {
    for (const change of [
      { from: period.from },
      { storeId: "foreign" },
      { tenantId: "foreign" },
      { actorUserId: "owner" },
      { url: "https://example.com" },
      { limit: 10000 },
    ]) {
      expect(
        customerDebtReportInput.safeParse({ currencyCode: "NGN", ...change })
          .success,
      ).toBe(false)
      expect(stockReportInput.safeParse(change).success).toBe(false)
    }
  })
  test("navigation retains exact original filters and rejects modified target authority", () => {
    const target: BusinessReportTarget = {
      kind: "business_report",
      origin: { tenantId: "tenant", storeId: "store" },
      request: {
        report: "item_sales",
        filters: { ...period, catalogItemId: "original_item" },
      },
    }
    expect(businessReportTargetSchema.parse(target)).toEqual(target)
    expect(
      businessReportTargetSchema.safeParse({ ...target, tenantId: "foreign" })
        .success,
    ).toBe(false)
    expect(
      businessReportTargetSchema.safeParse({
        ...target,
        request: { ...target.request, storeId: "foreign" },
      }).success,
    ).toBe(false)
  })
})

test("G01 finance boundaries use exact Book/supplier, UTC as-of or inclusive period and bigint sequence", () => {
  const supplier = {
    bookId: "book",
    supplierId: "supplier",
    timezone: "UTC",
    asOfDate: "2026-10-12",
  }
  expect(supplierAgingReportInput.safeParse(supplier).success).toBe(true)
  for (const change of [
    { asOfDate: "2026-02-30" },
    { asOfDate: "0000-01-01" },
    { timezone: "Africa/Lagos" },
    { snapshotSequence: "9223372036854775808" },
    { storeId: "foreign" },
  ])
    expect(
      supplierAgingReportInput.safeParse({ ...supplier, ...change }).success,
    ).toBe(false)
  expect(
    postedProfitReportInput.safeParse({
      bookId: "book",
      timezone: "UTC",
      from: period.from,
      through: period.from,
    }).success,
  ).toBe(true)
  expect(
    postedProfitReportInput.safeParse({
      bookId: "book",
      timezone: "UTC",
      from: period.from,
      through: "2026-10-10T00:00:00Z",
    }).success,
  ).toBe(false)
})
