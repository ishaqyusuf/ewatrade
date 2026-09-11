import {
  QA_ACCELERATOR_CONTRACT_VERSION,
  exchangeQaWebCredential,
  getQaWebClientId,
  getQaWebMutationAvailability,
  qaAccessErrorResponse,
  qaAvailabilityResponse,
  setQaAuthorizationCookie,
  setQaWebClientCookie,
} from "@/lib/qa-access-server"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"

const inputSchema = z.object({
  contractVersion: z.literal(QA_ACCELERATOR_CONTRACT_VERSION),
  credential: z.string().trim().min(32).max(256),
  qaDomain: z.string().trim().min(3).max(253),
})

export async function POST(request: NextRequest) {
  const availability = getQaWebMutationAvailability(
    request,
    QA_ACCELERATOR_CONTRACT_VERSION,
  )
  if (!availability.available) {
    return qaAvailabilityResponse(availability)
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      {
        category: "authorization_required",
        message: "QA access could not be authorized.",
      },
      { status: 400 },
    )
  }

  const clientId = getQaWebClientId(request)
  try {
    const result = await exchangeQaWebCredential(request, {
      ...parsed.data,
      clientId,
    })
    const response = NextResponse.json({ authorization: result.authorization })
    setQaAuthorizationCookie(response, {
      expiresAt: result.authorization.expiresAt,
      request,
      token: result.token,
    })
    setQaWebClientCookie(response, { clientId, request })
    return response
  } catch (error) {
    const response = qaAccessErrorResponse(error)
    setQaWebClientCookie(response, { clientId, request })
    return response
  }
}
