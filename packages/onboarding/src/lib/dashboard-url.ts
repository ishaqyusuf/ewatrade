export function resolveDashboardUrl(params: {
  configuredUrl?: string
  isProduction: boolean
  platformDomain: string
}) {
  const configuredUrl = params.configuredUrl?.trim()
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "")
  return params.isProduction
    ? `https://dash.${params.platformDomain}`
    : `http://${params.platformDomain}/dashboard`
}
