export function resolveDashboardUrl(params: {
  configuredUrl?: string
  isProduction: boolean
  platformDomain: string
}) {
  const configuredUrl = params.configuredUrl?.trim()

  if (configuredUrl) {
    const normalized = configuredUrl.replace(/\/+$/, "")
    if (!params.isProduction) return normalized
    try {
      const url = new URL(normalized)
      if (url.hostname !== `dashboard.${params.platformDomain}`) return normalized
    } catch {
      // Fall through to the shared platform URL.
    }
  }
  return `${params.isProduction ? "https" : "http"}://${params.platformDomain}/dashboard`
}
