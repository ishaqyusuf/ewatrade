import { describe, expect, test } from "bun:test"

import {
  serviceCommerceReportDrilldownSchema,
  serviceCommerceReportSchema,
} from "./service-commerce-reporting"

describe("Service Commerce reporting API schemas", () => {
  test("accepts a strict, bounded aggregate report window", () => {
    expect(
      serviceCommerceReportSchema.parse({
        end: "2026-09-01T00:00:00.000Z",
        start: "2026-08-01T00:00:00.000Z",
        storeId: "store_1",
      }),
    ).toMatchObject({ storeId: "store_1" })

    expect(
      serviceCommerceReportSchema.safeParse({
        end: "2027-08-03T00:00:00.000Z",
        start: "2026-08-01T00:00:00.000Z",
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceReportSchema.safeParse({
        end: "2026-09-01T00:00:00.000Z",
        start: "2026-08-01T00:00:00.000Z",
        tenantId: "client-controlled",
      }).success,
    ).toBe(false)
  })

  test("allows only the shared aggregate drill-down categories", () => {
    expect(
      serviceCommerceReportDrilldownSchema.parse({
        category: "reliability",
        end: "2026-09-01T00:00:00.000Z",
        start: "2026-08-01T00:00:00.000Z",
      }).category,
    ).toBe("reliability")
    expect(
      serviceCommerceReportDrilldownSchema.safeParse({
        category: "customer_content",
        end: "2026-09-01T00:00:00.000Z",
        start: "2026-08-01T00:00:00.000Z",
      }).success,
    ).toBe(false)
  })
})
