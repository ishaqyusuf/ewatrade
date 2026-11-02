import { expect, test } from "bun:test"
import {
  buildReportPeriodFigures,
  reportPeriodRange,
  reportPeriodWindow,
} from "./report-periods"

// Thursday 15 October 2026, mid-afternoon local time.
const now = new Date(2026, 9, 15, 15, 30)

test("windows are local days ending at the start of tomorrow", () => {
  const tomorrow = new Date(2026, 9, 16)
  expect(reportPeriodWindow("today", now)).toEqual({
    after: new Date(2026, 9, 15),
    before: tomorrow,
  })
  expect(reportPeriodWindow("week", now)).toEqual({
    after: new Date(2026, 9, 12),
    before: tomorrow,
  })
  expect(reportPeriodWindow("month", now)).toEqual({
    after: new Date(2026, 9, 1),
    before: tomorrow,
  })
  expect(reportPeriodWindow("all", now)).toBeNull()
})

test("a week starts on Monday, including when today is Sunday", () => {
  const sunday = new Date(2026, 10, 1, 9)
  expect(reportPeriodWindow("week", sunday)?.after).toEqual(
    new Date(2026, 9, 26),
  )
  expect(reportPeriodRange("week", sunday)).toBe("26 Oct – 1 Nov")
})

test("range labels", () => {
  expect(reportPeriodRange("today", now)).toBe("Thu 15 Oct")
  expect(reportPeriodRange("week", now)).toBe("12 – 15 Oct")
  expect(reportPeriodRange("month", now)).toBe("1 – 15 Oct")
  expect(reportPeriodRange("week", new Date(2026, 9, 12, 8))).toBe("Mon 12 Oct")
  expect(reportPeriodRange("all", now)).toBeNull()
})

const group = (
  status: string,
  orderCount: number,
  orderValueMinor: number,
  outstandingMinor = 0,
  currencyCode = "NGN",
) => ({
  currencyCode,
  orderCount,
  orderValueMinor,
  outstandingMinor,
  paymentStatus: outstandingMinor ? "PARTIALLY_PAID" : "PAID",
  status,
})

test("sales count sale statuses only; received comes from payments", () => {
  const figures = buildReportPeriodFigures({
    defaultCurrencyCode: "NGN",
    orderGroups: [
      group("COMPLETED", 30, 36_000_000, 0),
      group("PENDING", 4, 5_250_000, 3_250_000),
      group("CANCELLED", 2, 900_000),
      group("DRAFT", 1, 100_000),
    ],
    payments: [
      {
        byMethod: [
          { amountMinor: 15_000_000, count: 14, method: "CASH" },
          { amountMinor: 18_250_000, count: 11, method: "BANK_TRANSFER" },
          { amountMinor: 4_750_000, count: 5, method: "POS" },
        ],
        currencyCode: "NGN",
        totalAmountMinor: 38_000_000,
        totalCount: 30,
      },
    ],
  })
  expect(figures.sales).toBe("₦412,500")
  expect(figures.orderCount).toBe(34)
  expect(figures.average).toBe("₦12,132.35")
  expect(figures.owed).toBe("₦32,500")
  expect(figures.received).toBe("₦380,000")
  expect(figures.receivedCount).toBe(30)
  expect(figures.receivedRows.map((row) => [row.title, row.amount])).toEqual([
    ["Transfer", "₦182,500"],
    ["Cash", "₦150,000"],
    ["POS", "₦47,500"],
  ])
  expect(figures.receivedRows[0]?.method).toBe("bank_transfer")
})

test("an empty period reads as zero in the business currency", () => {
  const figures = buildReportPeriodFigures({
    defaultCurrencyCode: "NGN",
    orderGroups: [],
    payments: [],
  })
  expect(figures).toMatchObject({
    average: null,
    orderCount: 0,
    owed: "₦0",
    received: "₦0",
    receivedCount: 0,
    receivedRows: [],
    sales: "₦0",
  })
})

test("several currencies are never added together", () => {
  const figures = buildReportPeriodFigures({
    defaultCurrencyCode: "NGN",
    orderGroups: [
      group("COMPLETED", 1, 100_000),
      group("COMPLETED", 1, 5_000, 0, "USD"),
    ],
    payments: [
      {
        byMethod: [{ amountMinor: 100_000, count: 1, method: "CASH" }],
        currencyCode: "NGN",
        totalAmountMinor: 100_000,
        totalCount: 1,
      },
      {
        byMethod: [{ amountMinor: 5_000, count: 1, method: "CARD" }],
        currencyCode: "USD",
        totalAmountMinor: 5_000,
        totalCount: 1,
      },
    ],
  })
  expect(figures.sales).toBe("Mixed currencies")
  expect(figures.average).toBeNull()
  expect(figures.received).toBe("Mixed currencies")
  expect(figures.receivedRows.map((row) => row.title)).toEqual([
    "Cash · NGN",
    "Card · USD",
  ])
})
