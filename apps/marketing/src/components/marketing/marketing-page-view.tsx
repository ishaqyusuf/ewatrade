import type { MarketingExperienceId } from "@/lib/marketing-experience"
import { isMarketingSignupEnabled } from "@/lib/marketing-signup"
import { MarketingExperience } from "./marketing-experience"

type MarketingPageViewProps = {
  experience: MarketingExperienceId
}

export function MarketingPageView({ experience }: MarketingPageViewProps) {
  return (
    <MarketingExperience
      experience={experience}
      signupEnabled={isMarketingSignupEnabled()}
    />
  )
}
