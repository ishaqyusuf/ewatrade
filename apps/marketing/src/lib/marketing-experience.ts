export const marketingExperienceIds = ["legacy-v1", "operator-v2"] as const

export type MarketingExperienceId = (typeof marketingExperienceIds)[number]

export const defaultMarketingExperience: MarketingExperienceId = "legacy-v1"

export function isMarketingExperienceId(
  value: string | undefined,
): value is MarketingExperienceId {
  return marketingExperienceIds.some((experience) => experience === value)
}

export function getRequestedMarketingExperience(
  value = process.env.EWATRADE_MARKETING_EXPERIENCE,
): MarketingExperienceId {
  return isMarketingExperienceId(value) ? value : defaultMarketingExperience
}
