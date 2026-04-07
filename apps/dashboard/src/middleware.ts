import { resolveTenantDomain } from "@ewatrade/utils"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"
const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"
const SIGNUP_URL = `${MARKETING_URL}/signup`

/**
 * Dashboard middleware.
 *
 * 1. Validates the hostname resolves to the dashboard surface.
 * 2. Enforces authentication: if no `ewt-session` cookie is present, redirects
 *    to the marketing signup page.
 * 3. Sets tenant context headers for downstream route handlers.
 *
 * Note: Session validity is NOT checked here — it is a presence-only check.
 * Full session validation happens in server components / route handlers via
 * the auth utilities once they are implemented.
 */
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? ""
  const result = resolveTenantDomain(hostname, {
    platformDomain: PLATFORM_DOMAIN,
  })

  // Non-dashboard hostnames → redirect to marketing
  if (result.kind !== "tenant" || result.surface !== "dashboard") {
    // Allow localhost through in dev
    if (!result.isLocalhost) {
      return NextResponse.redirect(new URL(MARKETING_URL))
    }
  }

  // Auth guard: require the session cookie to be present
  const sessionToken = request.cookies.get("ewt-session")?.value

  if (!sessionToken) {
    const signupUrl = new URL(SIGNUP_URL)
    signupUrl.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(signupUrl)
  }

  // Pass tenant context to route handlers
  const response = NextResponse.next()

  if (result.kind === "tenant" && result.tenantSlug) {
    response.headers.set("x-tenant-slug", result.tenantSlug)
  }
  response.headers.set("x-tenant-surface", "dashboard")
  response.headers.set("x-is-custom-domain", result.isCustomDomain ? "1" : "0")

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
}
