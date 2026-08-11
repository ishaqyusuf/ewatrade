import { describe, expect, test } from "bun:test"

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
})
