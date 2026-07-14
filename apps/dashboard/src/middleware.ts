import { resolveTenantDomain } from "@ewatrade/utils"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"
const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"
const LOGIN_URL = `${MARKETING_URL}/login`
const BETTER_AUTH_SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
] as const

/**
 * Dashboard middleware.
 *
 * 1. Validates the hostname resolves to the dashboard surface.
 * 2. Enforces authentication: if no Better Auth session cookie is present,
 *    redirects to the marketing login page.
 * 3. Sets tenant and path context headers for downstream route handlers.
 *
 * Note: Session validity is not checked here; it is a presence-only check.
 * Full session validation happens in server components / route handlers via
 * the auth utilities once they are implemented.
 */
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? ""
  const result = resolveTenantDomain(hostname, {
    platformDomain: PLATFORM_DOMAIN,
  })

  // Non-dashboard hostnames redirect to marketing.
  if (result.kind !== "tenant" || result.surface !== "dashboard") {
    // Allow localhost through in dev
    if (!result.isLocalhost) {
      return NextResponse.redirect(new URL(MARKETING_URL))
    }
  }

  // Auth guard: require the session cookie to be present
  const hasSessionCookie = BETTER_AUTH_SESSION_COOKIE_NAMES.some((cookieName) =>
    request.cookies.has(cookieName),
  )

  if (!hasSessionCookie) {
    const loginUrl = new URL(LOGIN_URL)
    loginUrl.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Pass tenant and path context to route handlers.
  const requestHeaders = new Headers(request.headers)

  if (result.kind === "tenant" && result.tenantSlug) {
    requestHeaders.set("x-tenant-slug", result.tenantSlug)
  }
  requestHeaders.set("x-tenant-surface", "dashboard")
  requestHeaders.set("x-is-custom-domain", result.isCustomDomain ? "1" : "0")
  requestHeaders.set("x-pathname", request.nextUrl.pathname)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
}
