import { resolveTenantDomain } from "@ewatrade/utils"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"
const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"
const BETTER_AUTH_SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
] as const
const PUBLIC_BRAND_ASSET_PATHS = new Set([
  "/favicon.png",
  "/shop-v3/cal-sans.woff2",
  "/shop-v3/inter-regular.ttf",
  "/brand/ewatrade-logo-precision-rise-v1.svg",
  "/brand/ewatrade-logo-precision-rise-v1-mono.svg",
  "/brand/ewatrade-logo-precision-rise-v1-reverse.svg",
  "/brand/ewatrade-logo-precision-rise-v1.png",
  "/brand/ewatrade-wordmark-precision-rise-v1.svg",
  "/brand/ewatrade-wordmark-precision-rise-v1-mono.svg",
  "/brand/ewatrade-wordmark-precision-rise-v1-reverse.svg",
  "/brand/ewatrade-mark-precision-rise-v1.svg",
  "/brand/ewatrade-mark-precision-rise-v1-mono.svg",
  "/brand/ewatrade-mark-precision-rise-v1-reverse.svg",
  "/brand/ewatrade-mark-precision-rise-v1.png",
])

/**
 * Dashboard middleware.
 *
 * 1. Validates the hostname resolves to the dashboard surface.
 * 2. Enforces authentication: if no Better Auth session cookie is present,
 *    redirects to the dashboard login page.
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
  const isOwnPreviewHostname =
    process.env.VERCEL_ENV === "preview" &&
    Boolean(process.env.VERCEL_URL) &&
    hostname.toLowerCase() === process.env.VERCEL_URL?.toLowerCase()

  // Non-dashboard hostnames redirect to marketing.
  if (
    !isOwnPreviewHostname &&
    result.kind === "tenant" &&
    result.surface !== "dashboard"
  ) {
    // Allow localhost through in dev
    if (!result.isLocalhost) {
      return NextResponse.redirect(new URL(MARKETING_URL))
    }
  }

  // Auth guard: require the session cookie to be present
  const hasSessionCookie = BETTER_AUTH_SESSION_COOKIE_NAMES.some((cookieName) =>
    request.cookies.has(cookieName),
  )
  const isPublicBrandAsset =
    ["GET", "HEAD"].includes(request.method) &&
    PUBLIC_BRAND_ASSET_PATHS.has(request.nextUrl.pathname)
  const isPublicAppAssociation =
    ["GET", "HEAD"].includes(request.method) &&
    [
      "/.well-known/apple-app-site-association",
      "/.well-known/assetlinks.json",
    ].includes(request.nextUrl.pathname)

  if (
    !hasSessionCookie &&
    !isPublicBrandAsset &&
    !isPublicAppAssociation &&
    !["/login", "/signup", "/staff-onboarding"].includes(
      request.nextUrl.pathname,
    )
  ) {
    const loginUrl = new URL("/login", request.nextUrl.origin)
    loginUrl.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    )
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
