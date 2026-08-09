import { describe, expect, test } from "bun:test"

import { isPrescriptionMediaGrantUsable } from "./prescription-media-viewer"

describe("prescription private-media grants", () => {
  test("requires an unexpired grant whose embed has not failed", () => {
    const now = Date.parse("2026-08-09T12:00:00.000Z")
    const grant = {
      expiresAt: new Date(now + 60_000),
      url: "https://private.example.invalid/media",
    }

    expect(isPrescriptionMediaGrantUsable(grant, now, false)).toBe(true)
    expect(isPrescriptionMediaGrantUsable(grant, now, true)).toBe(false)
    expect(isPrescriptionMediaGrantUsable(grant, now + 60_000, false)).toBe(
      false,
    )
    expect(isPrescriptionMediaGrantUsable(undefined, now, false)).toBe(false)
  })
})
