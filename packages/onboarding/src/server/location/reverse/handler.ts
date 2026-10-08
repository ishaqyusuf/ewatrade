import {
  GeoAddressError,
  createGeoLookupLimiter,
  isValidCoordinate,
  reverseGeocode,
} from "@ewatrade/utils/geo-address"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"

// Web sign-up's "Use my current location": the browser sends coordinates and
// gets back address fields. Public, so callers are capped.
const limiter = createGeoLookupLimiter()
const inputSchema = z
  .object({ latitude: z.number(), longitude: z.number() })
  .strict()
  .refine((value) => isValidCoordinate(value.latitude, value.longitude))

export async function POST(request: NextRequest) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json(
      { message: "That location is not valid." },
      { status: 400 },
    )
  const caller =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!limiter.allow(caller))
    return NextResponse.json(
      { message: "Too many location lookups. Enter the address instead." },
      { status: 429 },
    )
  try {
    const address = await limiter.run(() =>
      reverseGeocode(parsed.data.latitude, parsed.data.longitude),
    )
    return NextResponse.json({ address })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof GeoAddressError
            ? error.message
            : "We couldn’t look up this location. Try again.",
      },
      { status: 422 },
    )
  }
}
