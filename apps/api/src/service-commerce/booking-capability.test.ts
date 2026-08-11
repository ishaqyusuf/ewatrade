import { describe, expect, test } from "bun:test"

import { issueServiceCommerceBookingCapabilityToken } from "./booking-capability"

describe("Service Commerce booking capability issuer", () => {
  test("is deterministic for the same capability identity", () => {
    const input = {
      clientOperationId: "booking-link-1",
      purpose: "view_slots" as const,
      storeId: "store-1",
      tenantId: "tenant-1",
    }
    expect(issueServiceCommerceBookingCapabilityToken(input)).toBe(
      issueServiceCommerceBookingCapabilityToken(input),
    )
    expect(issueServiceCommerceBookingCapabilityToken(input)).toMatch(/^scb1\./)
  })

  test("changes token when the capability purpose changes", () => {
    expect(
      issueServiceCommerceBookingCapabilityToken({
        clientOperationId: "booking-link-1",
        purpose: "confirm",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).not.toBe(
      issueServiceCommerceBookingCapabilityToken({
        clientOperationId: "booking-link-1",
        purpose: "view_slots",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    )
  })
})
