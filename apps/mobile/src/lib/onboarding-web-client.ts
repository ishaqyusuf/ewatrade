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

// Direct signup (7 October 2026): the dashboard creates the setup session and
// emails the verification link; the app continues with the returned token.
export async function startNativeSignup(input: {
  fullName: string
  email: string
  businessName: string
  phone: string
}) {
  const response = await fetch(onboardingDashboardUrl("/api/signup/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "omit",
    redirect: "error",
  })
  const data = await response.json().catch(() => null)
  if (
    !response.ok ||
    typeof data?.accessToken !== "string" ||
    typeof data?.expiresAt !== "string"
  )
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Signup is unavailable. Try again.",
    )
  return {
    accessToken: data.accessToken as string,
    expiresAt: new Date(data.expiresAt).getTime(),
    message:
      typeof data.message === "string"
        ? data.message
        : "Check your email to continue.",
  }
}
