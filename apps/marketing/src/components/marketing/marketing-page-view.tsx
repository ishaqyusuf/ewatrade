import type { MarketingExperienceId } from "@/lib/marketing-experience"
import { MarketingExperience } from "./marketing-experience"

type MarketingPageViewProps = {
  experience: MarketingExperienceId
}

export function MarketingPageView({ experience }: MarketingPageViewProps) {
  return (
    <MarketingExperience
      experience={experience}
      signupEnabled={process.env.NEXT_PUBLIC_SIGNUP_ENABLED === "true"}
    />
  )
}
