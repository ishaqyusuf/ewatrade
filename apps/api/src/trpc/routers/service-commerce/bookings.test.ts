import { describe, expect, test } from "bun:test"

import { ServiceCommerceBookingError } from "@ewatrade/db/queries"
import { createCallerFactory } from "../../init"
import { serviceCommerceBookingsRouter } from "./bookings"

const createCaller = createCallerFactory(serviceCommerceBookingsRouter)

describe("Service Commerce bookings router", () => {
  test("fails an unknown public capability closed without a tenant context", async () => {
    const client = createCaller({
      db: {
        serviceBookingAccessCapability: {
          findFirst: async () => null,
        },
      },
      session: null,
      tenantContext: null,
    } as never)

    await expect(
      client.publicBookingSlots({
        accessToken: "x".repeat(20),
        from: new Date("2026-08-12T10:00:00.000Z"),
        to: new Date("2026-08-12T11:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  function staffCaller(role = "OWNER", failure?: Error) {
    const calls: string[] = []
    const db = {
      $transaction: async () => {
        calls.push("transaction")
        if (failure) throw failure
        return []
      },
    }
    return {
      calls,
      client: createCaller({
        db,
        session: { session: { id: "session-1" }, user: { id: "staff-1" } },
        tenantContext: {
          activeStore: { id: "store-1" },
          membership: { role },
          stores: [{ id: "store-1" }],
          tenant: { id: "tenant-1" },
        },
      } as never),
    }
  }

  test("staff booking reads need the same operator role as reschedule and cancel", async () => {
    const { calls, client } = staffCaller("VIEWER")
    await expect(
      client.sourceBookings({
        offeringId: "offering-1",
        sourceId: "request-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      client.staffBookingSlots({
        from: new Date("2026-11-01T23:00:00.000Z"),
        offeringId: "offering-1",
        resourceId: "resource-1",
        sourceId: "request-1",
        to: new Date("2026-11-02T23:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(calls).toEqual([])
  })

  test("staff booking reads refuse another Store and map repository refusals", async () => {
    const other = staffCaller()
    await expect(
      other.client.sourceBookings({
        offeringId: "offering-1",
        sourceId: "request-1",
        storeId: "store-2",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(other.calls).toEqual([])

    const refused = staffCaller(
      "OWNER",
      new ServiceCommerceBookingError(
        "BOOKING_FORBIDDEN",
        "Current accepted Store booking access is required.",
      ),
    )
    await expect(
      refused.client.sourceBookings({
        offeringId: "offering-1",
        sourceId: "request-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(refused.calls).toEqual(["transaction"])
  })

  test("open-time reads need a window that ends after it starts", async () => {
    const { calls, client } = staffCaller()
    await expect(
      client.staffBookingSlots({
        from: new Date("2026-11-02T23:00:00.000Z"),
        offeringId: "offering-1",
        resourceId: "resource-1",
        sourceId: "request-1",
        to: new Date("2026-11-01T23:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(calls).toEqual([])
  })
})
