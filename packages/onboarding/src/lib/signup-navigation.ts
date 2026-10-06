import { resolveDashboardUrl } from "./dashboard-url"

type DashboardNavigation = {
  configuredUrl?: string
  isProduction: boolean
  platformDomain: string
}

export function getDashboardRouteUrl(
  route: string,
  configuration: DashboardNavigation = {
    configuredUrl: process.env.NEXT_PUBLIC_DASHBOARD_URL,
    isProduction: process.env.NODE_ENV === "production",
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  },
) {
  const base = resolveDashboardUrl(configuration)
  const url = new URL(base)
  if (
    url.username ||
    url.password ||
    !["https:", "http:"].includes(url.protocol) ||
    (configuration.isProduction && url.protocol !== "https:")
  )
    throw new Error("Dashboard origin is invalid.")
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${route}`
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, route ? "" : "/")
}

export function getDashboardSignupUrl(accessToken?: string) {
  const url = new URL(getDashboardRouteUrl("/signup"))
  if (accessToken) url.searchParams.set("access_token", accessToken)
  return url.toString()
}

export function getMarketingUrl() {
  return (
    process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"
  ).replace(/\/+$/, "")
}
