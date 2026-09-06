const DEVELOPMENT_SCHEME = "ewatrade-dev:"
const ONBOARDING_QA_HOST = "onboarding-market-day"

export function resolveOnboardingMarketDayQaPath(
  path: string,
  development: boolean,
): "/onboarding" | null {
  if (!development) return null

  try {
    const url = new URL(path)
    const hasExactPath = url.pathname === "" || url.pathname === "/"

    if (
      url.protocol !== DEVELOPMENT_SCHEME ||
      url.hostname !== ONBOARDING_QA_HOST ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      !hasExactPath ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null
    }

    return "/onboarding"
  } catch {
    return null
  }
}
