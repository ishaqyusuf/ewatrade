import { describe, expect, test } from "bun:test"
import {
  GeoAddressError,
  addressFromNominatim,
  createGeoLookupLimiter,
  isValidCoordinate,
  mapsUrl,
  reverseGeocode,
} from "./geo-address"

const ibadan = {
  address: {
    city: "Ibadan",
    country: "Nigeria",
    country_code: "ng",
    road: "Old Oyo Road",
    state: "Oyo State",
    suburb: "Ojoo",
  },
  display_name: "Old Oyo Road, Ojoo, Ibadan, Oyo State, Nigeria",
}

describe("geo address", () => {
  test("maps a reverse result to address fields", () => {
    expect(addressFromNominatim(ibadan, 7.47, 3.91)).toEqual({
      addressLine1: "Old Oyo Road, Ojoo",
      city: "Ibadan",
      countryCode: "NG",
      countryName: "Nigeria",
      label: "Old Oyo Road, Ojoo, Ibadan, Oyo State, Nigeria",
      latitude: 7.47,
      longitude: 3.91,
      region: "Oyo State",
    })
  })

  test("uses town or village when there is no city", () => {
    const result = addressFromNominatim(
      { address: { country_code: "ke", road: "A2", town: "Nanyuki" } },
      0.01,
      37.07,
    )
    expect(result?.city).toBe("Nanyuki")
    expect(result?.countryCode).toBe("KE")
  })

  test("returns null without an address", () => {
    expect(addressFromNominatim({}, 1, 1)).toBeNull()
  })

  test("validates coordinates and builds a maps link", () => {
    expect(isValidCoordinate(91, 0)).toBe(false)
    expect(isValidCoordinate(7.4, 3.9)).toBe(true)
    expect(mapsUrl(7.4, 3.9)).toBe(
      "https://www.google.com/maps/search/?api=1&query=7.400000,3.900000",
    )
  })

  test("calls the provider with a user agent and maps its reply", async () => {
    let seen: { url: string; agent: string | null } | null = null
    const fake = (async (url: URL, init: RequestInit) => {
      seen = {
        agent: new Headers(init.headers).get("User-Agent"),
        url: String(url),
      }
      return new Response(JSON.stringify(ibadan))
    }) as unknown as typeof fetch
    const address = await reverseGeocode(7.47, 3.91, { fetch: fake })
    expect(address.city).toBe("Ibadan")
    expect(seen?.url).toContain("lat=7.470000")
    expect(seen?.agent).toContain("EwaTrade")
  })

  test("reports failures with a short message", async () => {
    const failing = (async () =>
      new Response("busy", { status: 503 })) as unknown as typeof fetch
    await expect(reverseGeocode(7, 3, { fetch: failing })).rejects.toThrow(
      GeoAddressError,
    )
    await expect(reverseGeocode(100, 3)).rejects.toThrow("not valid")
  })
})

describe("geo lookup limiter", () => {
  test("caps each caller per window", () => {
    const limiter = createGeoLookupLimiter({ perCaller: 2, windowMs: 1000 })
    expect(limiter.allow("a", 0)).toBe(true)
    expect(limiter.allow("a", 10)).toBe(true)
    expect(limiter.allow("a", 20)).toBe(false)
    expect(limiter.allow("b", 20)).toBe(true)
    expect(limiter.allow("a", 1500)).toBe(true)
  })

  test("spaces calls apart", async () => {
    const limiter = createGeoLookupLimiter({ spacingMs: 40 })
    const started: number[] = []
    await Promise.all(
      [1, 2].map(() => limiter.run(async () => started.push(Date.now()))),
    )
    expect(started[1] - started[0]).toBeGreaterThanOrEqual(35)
  })
})
