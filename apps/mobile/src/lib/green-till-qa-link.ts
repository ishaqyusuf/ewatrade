const QA_ROUTES = new Set([
  "qa-startup-splash-modal",
  "qa-auth-onboarding-modal",
  "qa-owner-setup-modal",
])

export function resolveGreenTillQaPath(
  path: string,
  development: boolean,
): string | null {
  if (!development) return null
  try {
    const url = new URL(path)
    if (
      url.protocol !== "ewatrade-dev:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      (url.pathname !== "" && url.pathname !== "/") ||
      !QA_ROUTES.has(url.hostname)
    )
      return null
    return `/${url.hostname}${url.search}`
  } catch {
    return null
  }
}
