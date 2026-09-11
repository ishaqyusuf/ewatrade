import {
  type MarketingExperienceId,
  defaultMarketingExperience,
} from "./marketing-experience"

export const marketingExperienceProductionReadiness = {
  "legacy-v1": true,
  "operator-v2": true,
} satisfies Record<MarketingExperienceId, boolean>

type ResolveMarketingExperienceOptions = {
  requestedExperience: MarketingExperienceId
  nodeEnvironment?: string
}

export function resolveMarketingExperience({
  requestedExperience,
  nodeEnvironment = process.env.NODE_ENV,
}: ResolveMarketingExperienceOptions): MarketingExperienceId {
  if (
    nodeEnvironment === "production" &&
    !marketingExperienceProductionReadiness[requestedExperience]
  ) {
    return defaultMarketingExperience
  }

  return requestedExperience
}
