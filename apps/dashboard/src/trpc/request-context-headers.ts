import { resolveTenantDomain } from "@ewatrade/utils"

type Environment = Readonly<Record<string, string | undefined>>

/** Server configuration selects the API; request headers never select a new upstream. */
export function dashboardServerApiOrigin(
  environment: Environment,
  requestOrigin: string | null,
) {
  const configured =
    environment.API_URL?.trim() ||
    environment.NEXT_PUBLIC_API_URL?.trim() ||
    requestOrigin
  if (!configured) throw new Error("Dashboard API origin is unavailable.")
  const url = new URL(configured)
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Dashboard API configuration must be an HTTP origin.")
  return url.origin
}

/** Existing server forwarding contract, computed once per request; never serialize to the client. */
export function buildDashboardRequestContext(
  requestHeaders: Headers,
  environment: Environment,
) {
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https")
  const requestOrigin = host ? new URL(`${protocol}://${host}`).origin : null
  const existing = requestHeaders.get("x-tenant-slug") || null
  const domain =
    !existing && host
      ? resolveTenantDomain(host, {
          platformDomain:
            environment.NEXT_PUBLIC_PLATFORM_DOMAIN ??
            environment.PLATFORM_DOMAIN ??
            "ewatrade.com",
        })
      : null
  const tenantSlug =
    existing ?? (domain?.kind === "tenant" ? domain.tenantSlug : null)
  const cookie = requestHeaders.get("cookie")
  const authorization = requestHeaders.get("authorization")
  return {
    apiOrigin: dashboardServerApiOrigin(environment, requestOrigin),
    headers: {
      "x-trpc-source": "rsc",
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
      ...(tenantSlug ? { "x-tenant-slug": tenantSlug } : {}),
    },
  }
}

export function dashboardReadSignal(signal?: AbortSignal | null) {
  const timeout = AbortSignal.timeout(15_000)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
