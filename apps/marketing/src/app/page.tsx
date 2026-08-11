import { MarketingPageView } from "@/components/marketing/marketing-page-view"
import { getRequestedMarketingExperience } from "@/lib/marketing-experience"
import { resolveMarketingExperience } from "@/lib/marketing-experience-policy"

export default function HomePage() {
  const experience = resolveMarketingExperience({
    requestedExperience: getRequestedMarketingExperience(),
  })

  return <MarketingPageView experience={experience} />
}
