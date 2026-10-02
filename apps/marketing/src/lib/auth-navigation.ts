import { resolveDashboardUrl } from "./dashboard-url"

export function getDashboardLoginUrl() {
  const dashboardUrl = resolveDashboardUrl({
    configuredUrl: process.env.NEXT_PUBLIC_DASHBOARD_URL,
    isProduction: process.env.NODE_ENV === "production",
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  })
  return `${dashboardUrl.replace(/\/+$/, "")}/login`
}
