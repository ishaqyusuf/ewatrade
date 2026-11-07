import { expect, spyOn, test } from "bun:test"
import { prisma } from "@ewatrade/db"
import { createCallerFactory } from "../init"
import { locationRouter } from "./location"

test("retired native geocoding rejects coordinates without provider or database access", async () => {
  const fetch = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      () => {
        throw new Error("No location provider may be contacted")
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  )
  const caller = createCallerFactory(locationRouter)({
    db: new Proxy(prisma, {
      get() {
        throw new Error("No database access expected")
      },
    }),
    requestHeaders: new Headers(),
    session: null,
    tenantSlug: null,
    tenantContext: null,
    tenantId: null,
    requestId: "manual-address-launch",
    cfRay: null,
    isInternalRequest: false,
    forcePrimary: false,
    origin: null,
    clientIp: null,
    privacyClientIp: null,
    userAgent: null,
    activeStoreId: null,
    qaSessionScope: null,
  })
  try {
    await expect(
      caller.reverseGeocode({ latitude: 0, longitude: 0 }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message:
        "Automatic address lookup is unavailable. Enter the address manually.",
    })
    await expect(
      caller.reverseGeocode({ latitude: 91, longitude: 0 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    fetch.mockRestore()
  }
})
