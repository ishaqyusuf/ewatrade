import { getWebUrl } from "./base-url"
import { onboardingLinkConfiguration } from "./onboarding-continuation-store"

export function onboardingDashboardUrl(path: string) {
  const config = onboardingLinkConfiguration()
  const configured =
    config.dashboardUrl ||
    (config.variant === "production" ? "https://dash.ewatrade.com" : "")
  if (!configured)
    throw new Error("The setup website is not configured for this app.")
  const base = new URL(configured)
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !["http:", "https:"].includes(base.protocol) ||
    (config.variant !== "development" && base.protocol !== "https:") ||
    (config.variant !== "production" &&
      ["dash.ewatrade.com", "dashboard.ewatrade.com"].includes(base.hostname))
  )
    throw new Error("The setup website does not match this app environment.")
  return `${base.origin}${base.pathname.replace(/\/$/, "")}${path}`
}

async function postOnboarding(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
    redirect: "error",
  })
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Setup is unavailable. Try again.",
    )
  return {
    message:
      typeof data?.message === "string"
        ? data.message
        : "Check your email to continue.",
  }
}

export function requestOnboardingVerification(accessToken: string) {
  return postOnboarding(
    onboardingDashboardUrl("/api/early-access/verification"),
    { accessToken },
  )
}

export function requestNativeEarlyAccess(input: {
  fullName: string
  email: string
  companyName: string
  phone: string
  businessSize: string
  recordSystem: string
  launchTimeline: string
  setupNeeds: string[]
}) {
  const base = new URL(getWebUrl())
  const config = onboardingLinkConfiguration()
  if (
    config.variant !== "production" &&
    ["ewatrade.com", "www.ewatrade.com"].includes(base.hostname)
  )
    throw new Error("The request website does not match this app environment.")
  return postOnboarding(new URL("/api/early-access", base).toString(), input)
}
