import { resolveDashboardUrl } from "@/lib/dashboard-url"
import {
  QA_ACCELERATOR_CONTRACT_VERSION,
  appendWebSessionCookies,
  getQaWebMutationAvailability,
  qaAccessErrorResponse,
  qaAvailabilityResponse,
  selectQaWebProfile,
} from "@/lib/qa-access-server"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"

const inputSchema = z.object({
  profileReference: z.string().trim().min(32).max(160),
})

function getDashboardUrl() {
  return resolveDashboardUrl({
    configuredUrl: process.env.NEXT_PUBLIC_DASHBOARD_URL,
    isProduction: process.env.NODE_ENV === "production",
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  })
}

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
      { message: "Select an available QA business." },
      { status: 400 },
    )
  }

  try {
    const result = await selectQaWebProfile(
      request,
      parsed.data.profileReference,
    )
    const response = NextResponse.json({
      dashboardUrl: getDashboardUrl(),
      profile: result.profile,
    })
    appendWebSessionCookies(response, {
      expiresAt: result.expiresAt,
      storeId: result.profile.storeId,
      tenantSlug: result.profile.businessSlug,
      token: result.token,
    })
    return response
  } catch (error) {
    return qaAccessErrorResponse(error)
  }
}
