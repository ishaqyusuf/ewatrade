/**
 * Turning a device location into a business address. Both the mobile API and
 * the dashboard use reverseGeocode, so the provider can be swapped in one place.
 * The provider is OpenStreetMap Nominatim, which asks for a named user agent,
 * at most one request per second, and visible attribution.
 */

export type ResolvedAddress = {
  /** Street line, such as "Km 4, Old Oyo Road". */
  addressLine1: string
  city: string
  /** State, province or region. */
  region: string
  /** ISO 3166-1 alpha-2, such as NG. */
  countryCode: string
  countryName: string
  /** One readable line for the location card. */
  label: string
  latitude: number
  longitude: number
}

export const GEO_ADDRESS_ATTRIBUTION = "Address from © OpenStreetMap"

export function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  )
}

/** A link that opens the location in the device's maps app or browser. */
export function mapsUrl(latitude: number, longitude: number) {
  const lat = latitude.toFixed(6)
  const lon = longitude.toFixed(6)
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
}

type NominatimAddress = Partial<
  Record<
    | "house_number"
    | "road"
    | "pedestrian"
    | "neighbourhood"
    | "suburb"
    | "quarter"
    | "city"
    | "town"
    | "village"
    | "municipality"
    | "county"
    | "state_district"
    | "state"
    | "region"
    | "country"
    | "country_code",
    string
  >
>

const clean = (value?: string | null) => value?.trim() ?? ""

/** Maps a Nominatim reverse result to a business address. */
export function addressFromNominatim(
  result: { address?: NominatimAddress; display_name?: string } | null,
  latitude: number,
  longitude: number,
): ResolvedAddress | null {
  const address = result?.address
  if (!address) return null
  const street = clean(address.road ?? address.pedestrian)
  const houseNumber = clean(address.house_number)
  const area = clean(address.neighbourhood ?? address.suburb ?? address.quarter)
  const addressLine1 = [houseNumber ? `${houseNumber} ${street}` : street, area]
    .filter(Boolean)
    .join(", ")
  const city = clean(
    address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      address.county,
  )
  const region = clean(
    address.state ?? address.region ?? address.state_district,
  )
  const countryName = clean(address.country)
  const countryCode = clean(address.country_code).toUpperCase()
  if (!addressLine1 && !city && !countryCode) return null
  const label = [addressLine1, city, region, countryName]
    .filter(Boolean)
    .join(", ")
  return {
    addressLine1,
    city,
    countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : "",
    countryName,
    label: label || clean(result?.display_name),
    latitude,
    longitude,
    region,
  }
}

export class GeoAddressError extends Error {}

/** Looks up the address at a point. Throws GeoAddressError with a short message. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  options: {
    fetch?: typeof fetch
    signal?: AbortSignal
    userAgent?: string
  } = {},
): Promise<ResolvedAddress> {
  if (!isValidCoordinate(latitude, longitude))
    throw new GeoAddressError("That location is not valid.")
  const url = new URL("https://nominatim.openstreetmap.org/reverse")
  url.search = new URLSearchParams({
    "accept-language": "en",
    addressdetails: "1",
    format: "jsonv2",
    lat: latitude.toFixed(6),
    lon: longitude.toFixed(6),
    zoom: "18",
  }).toString()
  let response: Response
  try {
    response = await (options.fetch ?? fetch)(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          options.userAgent ?? "EwaTrade/1.0 (support@ewatrade.com)",
      },
      signal: options.signal ?? AbortSignal.timeout(8000),
    })
  } catch {
    throw new GeoAddressError("We couldn’t look up this location. Try again.")
  }
  if (!response.ok)
    throw new GeoAddressError("We couldn’t look up this location. Try again.")
  const address = addressFromNominatim(
    (await response.json().catch(() => null)) as Parameters<
      typeof addressFromNominatim
    >[0],
    latitude,
    longitude,
  )
  if (!address)
    throw new GeoAddressError(
      "No street address was found here. Enter it below.",
    )
  return address
}

/**
 * Guards a public lookup endpoint: at most `perCaller` lookups per minute for
 * each caller, and calls spaced at least `spacingMs` apart for the provider.
 */
export function createGeoLookupLimiter({
  perCaller = 10,
  spacingMs = 1_100,
  windowMs = 60_000,
} = {}) {
  const callers = new Map<string, number[]>()
  let queue: Promise<unknown> = Promise.resolve()
  let lastCallAt = 0
  return {
    allow(caller: string, now = Date.now()) {
      const recent = (callers.get(caller) ?? []).filter(
        (at) => now - at < windowMs,
      )
      if (recent.length >= perCaller) return false
      recent.push(now)
      callers.set(caller, recent)
      return true
    },
    run<T>(task: () => Promise<T>) {
      const next = queue.then(async () => {
        const wait = lastCallAt + spacingMs - Date.now()
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
        lastCallAt = Date.now()
        return task()
      })
      queue = next.catch(() => undefined)
      return next
    },
  }
}
