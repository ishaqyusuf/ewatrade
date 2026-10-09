const QA_ROUTES = new Set([
  "qa-startup-splash-modal",
  "qa-auth-onboarding-modal",
  "qa-owner-setup-modal",
  // Quick Fill forms, so QA can open each one directly. The screens still
  // apply their own sign-in and role checks.
  "customer-ledger-modal",
  "global-search",
  "closeout-modal",
  "catalog-items-modal",
  "orders",
  "receipt-settings-modal",
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
    const recordPath =
      ["catalog-item", "order"].includes(url.hostname) &&
      /^\/[A-Za-z0-9_-]+$/.test(url.pathname)
    if (
      url.protocol !== "ewatrade-dev:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      (!recordPath && url.pathname !== "" && url.pathname !== "/") ||
      (!recordPath && !QA_ROUTES.has(url.hostname))
    )
      return null
    return `/${url.hostname}${recordPath ? url.pathname : ""}${url.search}`
  } catch {
    return null
  }
}
