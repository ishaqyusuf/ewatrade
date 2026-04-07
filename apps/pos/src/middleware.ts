import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { resolveTenantDomain } from "@ewatrade/utils"

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

/**
 * POS middleware.
 *
 * Resolves the incoming hostname and ensures this request is directed at the
 * POS surface. Non-POS requests are redirected to the marketing site.
 * Tenant context (slug) is forwarded as request headers for use in route handlers.
 */
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? ""
  const result = resolveTenantDomain(hostname, { platformDomain: PLATFORM_DOMAIN })

  // Allow the request if it resolves to a tenant POS surface
  if (result.kind === "tenant" && result.surface === "pos") {
    const response = NextResponse.next()

    if (result.tenantSlug) {
      response.headers.set("x-tenant-slug", result.tenantSlug)
    }
    response.headers.set("x-tenant-surface", "pos")
    response.headers.set("x-is-custom-domain", result.isCustomDomain ? "1" : "0")

    return response
  }

  // In local dev, allow through to avoid friction
  if (result.isLocalhost) {
    const response = NextResponse.next()
    response.headers.set("x-tenant-surface", "pos")
    return response
  }

  return NextResponse.redirect(new URL(MARKETING_URL))
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"]
}
