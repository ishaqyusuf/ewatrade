export const HOME_GUIDED_JOURNEY_QA_STATES = [
  "new-business",
  "unfinished-catalog",
  "catalog-ready",
  "first-order",
  "solo",
  "invitation-pending",
  "team-active",
  "everyday",
  "returning-empty",
  "queued",
  "offline-cached",
  "offline-empty",
  "loading",
  "unavailable",
  "orders-unavailable",
  "stock-work",
  "established-unready",
  "team-unknown",
  "team-existing",
  "team-restricted",
] as const
export type HomeGuidedJourneyQaState =
  (typeof HOME_GUIDED_JOURNEY_QA_STATES)[number]

export function resolveHomeGuidedJourneyQaPath(
  path: string,
  development: boolean,
) {
  if (!development) return null
  try {
    const url = new URL(path)
    const state = url.searchParams.get("state")
    if (
      url.protocol !== "ewatrade-dev:" ||
      url.hostname !== "home-guided-journey" ||
      !HOME_GUIDED_JOURNEY_QA_STATES.some((candidate) => candidate === state)
    )
      return null
    const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light"
    const scope = ["account-b", "business-b", "store-b"].includes(
      url.searchParams.get("scope") ?? "",
    )
      ? url.searchParams.get("scope")
      : "a"
    return `/design-system/home-guided-journey?state=${state}&theme=${theme}&scope=${scope}`
  } catch {
    return null
  }
}
