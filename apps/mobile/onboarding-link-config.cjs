function getOnboardingLinkConfig(variant, configured) {
  if (!["production", "preview", "development", "dev"].includes(variant)) {
    throw new Error("Onboarding app variant is invalid.")
  }
  const value =
    configured?.trim() ||
    (variant === "production" ? "https://dashboard.ewatrade.com" : "")
  if (!value) return null
  const url = new URL(value)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["https:", "http:"].includes(url.protocol) ||
    (variant !== "development" &&
      variant !== "dev" &&
      url.protocol !== "https:") ||
    (variant !== "production" && url.hostname === "dashboard.ewatrade.com")
  ) {
    throw new Error("Onboarding website does not match the app variant.")
  }
  const base = url.pathname.replace(/\/$/, "")
  return {
    dashboardUrl: `${url.origin}${base}`,
    // Loopback development runs use the Dev scheme; these cannot be publicly verified.
    host:
      url.protocol === "https:" &&
      !url.port &&
      !["localhost", "127.0.0.1"].includes(url.hostname) &&
      !url.hostname.endsWith(".localhost")
        ? url.hostname
        : null,
    paths: [`${base}/signup`, `${base}/api/early-access/verify`],
  }
}

module.exports = { getOnboardingLinkConfig }
