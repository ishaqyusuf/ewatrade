import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { resolveTenantDomain } from "@ewatrade/utils"

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

/**
 * Storefront middleware.
 *
 * Resolves the incoming hostname against the platform domain. If the request
 * resolves to a tenant storefront surface, it sets tenant context headers and
 * proceeds. Any non-storefront hostname (e.g. hitting the storefront app
 * directly with the marketing domain) is redirected to the marketing site.
 */
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? ""
  const result = resolveTenantDomain(hostname, { platformDomain: PLATFORM_DOMAIN })

  // Allow the request if it resolves to a tenant storefront
  if (result.kind === "tenant" && result.surface === "storefront") {
    const response = NextResponse.next()

    if (result.tenantSlug) {
      response.headers.set("x-tenant-slug", result.tenantSlug)
    }
    response.headers.set("x-tenant-surface", "storefront")
    response.headers.set("x-is-custom-domain", result.isCustomDomain ? "1" : "0")

    return response
  }

  // In local dev, allow through if localhost to avoid dev friction
  if (result.isLocalhost) {
    const response = NextResponse.next()
    response.headers.set("x-tenant-surface", "storefront")
    return response
  }

  // Redirect marketing & unknown hostnames to the marketing site
  return NextResponse.redirect(new URL(MARKETING_URL))
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     * - api routes
     */
    "/((?!_next/static|_next/image|favicon.ico|api).*)"
  ]
}
