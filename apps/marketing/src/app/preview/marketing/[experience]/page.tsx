import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { MarketingPageView } from "@/components/marketing/marketing-page-view"
import { isMarketingExperienceId } from "@/lib/marketing-experience"
import { canPreviewMarketingExperience } from "@/lib/marketing-preview-access"

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
}

type MarketingPreviewPageProps = {
  params: Promise<{ experience: string }>
  searchParams: Promise<{ token?: string | string[] }>
}

export default async function MarketingPreviewPage({
  params,
  searchParams,
}: MarketingPreviewPageProps) {
  const [{ experience }, query] = await Promise.all([params, searchParams])
  const providedToken = Array.isArray(query.token)
    ? query.token[0]
    : query.token

  if (
    !isMarketingExperienceId(experience) ||
    !canPreviewMarketingExperience({ providedToken })
  ) {
    notFound()
  }

  return <MarketingPageView experience={experience} />
}
