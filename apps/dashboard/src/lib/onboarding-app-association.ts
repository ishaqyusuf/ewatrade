type AssociationEnvironment = {
  APP_ENV?: string
  VERCEL_ENV?: string
  NEXT_PUBLIC_DASHBOARD_URL?: string
  EWATRADE_APPLE_APP_SITE_ASSOCIATION_APP_IDS?: string
  EWATRADE_ANDROID_APP_LINK_PACKAGE_NAMES?: string
  EWATRADE_ANDROID_APP_LINK_CERTIFICATE_SHA256?: string
}

export function onboardingAppAssociations(env: AssociationEnvironment) {
  const mode = env.APP_ENV ?? env.VERCEL_ENV
  const suffix =
    mode === "production"
      ? "app"
      : mode === "preview"
        ? "preview"
        : ["local", "dev", "development"].includes(mode ?? "")
          ? "dev"
          : null
  if (!suffix || (env.VERCEL_ENV === "preview" && suffix === "app"))
    return { apple: null, android: null }
  let basePath = ""
  if (env.NEXT_PUBLIC_DASHBOARD_URL) {
    try {
      const url = new URL(env.NEXT_PUBLIC_DASHBOARD_URL)
      if (url.username || url.password || url.search || url.hash)
        return { apple: null, android: null }
      basePath = url.pathname.replace(/\/$/, "")
    } catch {
      return { apple: null, android: null }
    }
  }
  const paths = [`${basePath}/signup`, `${basePath}/api/early-access/verify`]
  const packageName = `com.ewatrade.${suffix}`
  const appID = env.EWATRADE_APPLE_APP_SITE_ASSOCIATION_APP_IDS?.trim()
  const fingerprint = env.EWATRADE_ANDROID_APP_LINK_CERTIFICATE_SHA256?.trim()
  const apple =
    appID &&
    new RegExp(`^[A-Z0-9]{10}\\.com\\.ewatrade\\.${suffix}$`).test(appID)
      ? { applinks: { details: [{ appID, paths }] } }
      : null
  const android =
    env.EWATRADE_ANDROID_APP_LINK_PACKAGE_NAMES?.trim() === packageName &&
    fingerprint &&
    /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint)
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: packageName,
              sha256_cert_fingerprints: [fingerprint],
            },
          },
        ]
      : null
  return { apple, android }
}
