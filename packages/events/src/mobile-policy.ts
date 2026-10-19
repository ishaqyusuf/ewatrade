/** Explicit build identity is additional to server QA/age/privacy permission. */
export function canInitializeMobileAnalytics(input: {
  development: boolean
  platform: string
  environment: unknown
  enabled: unknown
  project: unknown
  endpoint: unknown
  authenticated: boolean
}) {
  return (
    !input.development &&
    input.platform === "android" &&
    input.environment === "production" &&
    input.enabled === "true" &&
    input.project === "ewatrade-mobile" &&
    input.endpoint === "https://ewatrade.com/api/analytics/mobile" &&
    input.authenticated
  )
}

/** Server deployment identity never comes from request headers or app claims. */
export function canForwardMobileAnalytics(env: {
  NODE_ENV?: string
  APP_ENV?: string
  VERCEL?: string
  VERCEL_ENV?: string
  LOGLY_MOBILE_ENABLED?: string
}) {
  return (
    env.NODE_ENV === "production" &&
    env.APP_ENV === "production" &&
    env.VERCEL === "1" &&
    env.VERCEL_ENV === "production" &&
    env.LOGLY_MOBILE_ENABLED === "true"
  )
}
