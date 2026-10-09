type LinkConfiguration = {
  variant: "production" | "preview" | "development"
  dashboardUrl?: string
}

const schemes = {
  production: "ewatrade:",
  preview: "ewatrade-preview:",
  development: "ewatrade-dev:",
} as const

// Only user setup/verification is app-owned. Reviewer approval is never routed
// into signup, and a query parameter cannot choose the application environment.
export function resolveOnboardingContinuationLink(
  value: string,
  configuration: LinkConfiguration,
): { kind: "setup" | "verification"; token: string } | null {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash) return null
    let kind: "setup" | "verification"
    let parameter: string
    if (url.protocol === schemes[configuration.variant]) {
      if (url.hostname !== "onboarding" || url.port) return null
      if (url.pathname === "/continue") {
        kind = "setup"
        parameter = "access_token"
      } else if (url.pathname === "/verify") {
        kind = "verification"
        parameter = "token"
      } else return null
    } else {
      const configured =
        configuration.dashboardUrl ||
        (configuration.variant === "production"
          ? "https://dash.ewatrade.com"
          : "")
      if (!configured) return null
      const dashboard = new URL(configured)
      if (
        dashboard.username ||
        dashboard.password ||
        dashboard.search ||
        dashboard.hash
      )
        return null
      if (
        configuration.variant !== "development" &&
        dashboard.protocol !== "https:"
      )
        return null
      if (
        !["http:", "https:"].includes(dashboard.protocol) ||
        url.origin !== dashboard.origin
      )
        return null
      if (
        configuration.variant !== "production" &&
        ["dash.ewatrade.com", "dashboard.ewatrade.com"].includes(
          dashboard.hostname,
        )
      )
        return null
      const base = dashboard.pathname.replace(/\/$/, "")
      if (url.pathname === `${base}/signup`) {
        kind = "setup"
        parameter = "access_token"
      } else if (url.pathname === `${base}/api/early-access/verify`) {
        kind = "verification"
        parameter = "token"
      } else return null
    }
    if ([...url.searchParams.keys()].some((key) => key !== parameter))
      return null
    const values = url.searchParams.getAll(parameter)
    const token = values[0]
    if (
      values.length !== 1 ||
      !token ||
      !(
        kind === "setup" ? /^ea_[A-Za-z0-9_-]{43}$/ : /^ear_[A-Za-z0-9_-]{43}$/
      ).test(token)
    )
      return null
    return { kind, token }
  } catch {
    return null
  }
}
