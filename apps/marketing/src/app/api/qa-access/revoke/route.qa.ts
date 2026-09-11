import {
  QA_ACCELERATOR_CONTRACT_VERSION,
  appendClearedWebSessionCookies,
  clearQaAuthorizationCookie,
  clearQaWebClientCookie,
  getQaWebMutationAvailability,
  qaAccessErrorResponse,
  qaAvailabilityResponse,
  revokeQaWebAuthorization,
} from "@/lib/qa-access-server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const availability = getQaWebMutationAvailability(
    request,
    QA_ACCELERATOR_CONTRACT_VERSION,
  )
  if (!availability.available) {
    return qaAvailabilityResponse(availability)
  }
  try {
    const result = await revokeQaWebAuthorization(request)
    const response = NextResponse.json(result)
    clearQaAuthorizationCookie(response, request)
    clearQaWebClientCookie(response, request)
    appendClearedWebSessionCookies(response)
    return response
  } catch (error) {
    return qaAccessErrorResponse(error)
  }
}
