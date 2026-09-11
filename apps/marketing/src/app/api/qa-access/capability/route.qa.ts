import {
  getQaWebAvailability,
  qaAvailabilityResponse,
} from "@/lib/qa-access-server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("contractVersion")
  const contractVersion = value ? Number(value) : undefined
  const availability = getQaWebAvailability(
    request,
    Number.isInteger(contractVersion) ? contractVersion : undefined,
  )
  return !availability.available &&
    availability.category === "environment_not_allowed"
    ? qaAvailabilityResponse(availability)
    : NextResponse.json(availability)
}
