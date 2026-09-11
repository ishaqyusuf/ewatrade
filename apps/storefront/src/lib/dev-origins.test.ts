import { describe, expect, test } from "bun:test"
import { resolveStorefrontAllowedDevOrigins } from "./dev-origins"

describe("resolveStorefrontAllowedDevOrigins", () => {
  test("allows the two standard Android emulator host bridges by default", () => {
    expect(resolveStorefrontAllowedDevOrigins()).toEqual([
      "10.0.2.2",
      "10.0.3.2",
    ])
  })

  test("accepts a bounded explicit device-development host list", () => {
    expect(
      resolveStorefrontAllowedDevOrigins("10.0.2.2, 192.168.18.2,10.0.2.2"),
    ).toEqual(["10.0.2.2", "192.168.18.2"])
  })
})
