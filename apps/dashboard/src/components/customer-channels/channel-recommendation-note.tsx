import { SettingsNotice } from "@/components/settings/settings-page"

import { channelRecommendationSummary } from "./channel-settings-labels"
import type { CustomerChannelRecommendation } from "./types"

/** The onboarding suggestion, as one short note under the settings. */
export function ChannelRecommendationNote({
  recommendation,
}: {
  recommendation: CustomerChannelRecommendation
}) {
  return (
    <SettingsNotice>
      {channelRecommendationSummary(recommendation)}
    </SettingsNotice>
  )
}
