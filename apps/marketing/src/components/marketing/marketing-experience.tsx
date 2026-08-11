import dynamic from "next/dynamic"
import type { ComponentType } from "react"

import type { MarketingExperienceId } from "@/lib/marketing-experience"
import type { MarketingExperienceProps } from "./marketing-experience-contract"

const marketingExperienceRegistry = {
  "legacy-v1": dynamic(() =>
    import("./experiences/legacy-v1").then((module) => module.LegacyV1Landing),
  ),
  "operator-v2": dynamic(() =>
    import("./experiences/operator-v2").then(
      (module) => module.OperatorV2Landing,
    ),
  ),
} satisfies Record<
  MarketingExperienceId,
  ComponentType<MarketingExperienceProps>
>

type MarketingExperiencePropsWithId = MarketingExperienceProps & {
  experience: MarketingExperienceId
}

export function MarketingExperience({
  experience,
  signupEnabled,
}: MarketingExperiencePropsWithId) {
  const Experience = marketingExperienceRegistry[experience]

  return <Experience signupEnabled={signupEnabled} />
}
