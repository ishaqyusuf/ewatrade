const QA_ROUTES = new Set([
  "qa-startup-splash-modal",
  "qa-auth-onboarding-modal",
  "qa-owner-setup-modal",
  "setup-assistant",
  "ask-assistant",
  // Quick Fill forms, so QA can open each one directly. The screens still
  // apply their own sign-in and role checks.
  "closeout-modal",
  "create-sale-modal",
  "customer-book-modal",
  "first-product-setup-modal",
  "new-business-onboarding-modal",
  "order-reminder-settings-modal",
  "service-jobs-modal",
  "staff-invite-modal",
  "stock-intake-modal",
  "unit-conversion-modal",
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
