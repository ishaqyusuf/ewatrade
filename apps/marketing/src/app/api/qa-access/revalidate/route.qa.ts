import {
  QA_ACCELERATOR_CONTRACT_VERSION,
  getQaWebAvailability,
  qaAccessErrorResponse,
  qaAvailabilityResponse,
  revalidateQaWebAuthorization,
} from "@/lib/qa-access-server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const availability = getQaWebAvailability(
    request,
    QA_ACCELERATOR_CONTRACT_VERSION,
  )
  if (!availability.available) {
    return qaAvailabilityResponse(availability)
  }
  try {
    return NextResponse.json(await revalidateQaWebAuthorization(request))
  } catch (error) {
    return qaAccessErrorResponse(error)
  }
}
