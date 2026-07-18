import { buildPlatformSurfaceHostname } from "@ewatrade/utils"

export function resolveDashboardUrl(params: {
  configuredUrl?: string
  isProduction: boolean
  platformDomain: string
}) {
  const configuredUrl = params.configuredUrl?.trim()

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "")
  }

  const hostname = buildPlatformSurfaceHostname({
    platformDomain: params.platformDomain,
    surface: "dashboard",
  })

  return `${params.isProduction ? "https" : "http"}://${hostname}`
}
