import { describe, expect, test } from "bun:test"

import {
  getServiceCommerceReportDefaultRange,
  loadServiceCommerceReportParams,
  resolveServiceCommerceReportRange,
} from "./use-service-commerce-report-params"

describe("Service Commerce report URL range", () => {
  test("defaults to a thirty-day window ending after the current UTC day", () => {
    const range = getServiceCommerceReportDefaultRange(
      new Date("2026-08-11T14:32:00.000Z"),
    )

    expect(range.from.toISOString()).toBe("2026-07-13T00:00:00.000Z")
    expect(range.to.toISOString()).toBe("2026-08-12T00:00:00.000Z")
  })

  test("keeps a valid URL range and rejects incomplete or reversed ranges", () => {
    const from = new Date("2026-08-01T00:00:00.000Z")
    const to = new Date("2026-08-08T00:00:00.000Z")
    const now = new Date("2026-08-11T00:00:00.000Z")

    expect(resolveServiceCommerceReportRange({ from, to }, now)).toEqual({
      from,
      to,
    })
    expect(
      resolveServiceCommerceReportRange({ from: to, to: from }, now),
    ).toEqual(getServiceCommerceReportDefaultRange(now))
    expect(resolveServiceCommerceReportRange({ from, to: null }, now)).toEqual(
      getServiceCommerceReportDefaultRange(now),
    )
    expect(
      resolveServiceCommerceReportRange(
        {
          from: new Date("2025-01-01T00:00:00.000Z"),
          to: new Date("2026-01-03T00:00:00.000Z"),
        },
        now,
      ),
    ).toEqual(getServiceCommerceReportDefaultRange(now))
  })

  test("loads only allowlisted URL detail, Store, and date scope values", () => {
    expect(
      loadServiceCommerceReportParams({
        detail: "media",
        from: "2026-08-01",
        store: "store_1",
        to: "2026-08-31",
      }),
    ).toMatchObject({
      detail: "media",
      from: new Date("2026-08-01T00:00:00.000Z"),
      store: "store_1",
      to: new Date("2026-08-31T00:00:00.000Z"),
    })

    expect(
      loadServiceCommerceReportParams({ detail: "customer_content" }),
    ).toMatchObject({
      detail: null,
    })
  })
})
