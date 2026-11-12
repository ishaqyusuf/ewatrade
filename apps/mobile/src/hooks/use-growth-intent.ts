import { trackProductEvent } from "@/runtime/analytics-runtime"
import { useTRPC } from "@/trpc/client"
import {
  type GrowthIntentFeature,
  type GrowthIntentInput,
  type GrowthIntentPlacement,
  growthIntentEvent,
  isSeePlansTap,
} from "@ewatrade/events/growth-intent"
import { useMutation } from "@tanstack/react-query"
import { useMemo } from "react"

type CountedFeature = Exclude<GrowthIntentFeature, "home" | "plan_billing">

/**
 * Lifecycle intent signals for "See plans" prompts. Logly gets the fixed-label
 * event; locked-feature taps also bump the per-business counter the
 * feature-intent play reads. Never blocks or changes navigation.
 */
export function useGrowthIntent() {
  const trpc = useTRPC()
  const { mutate } = useMutation(
    trpc.growthIntent.recordSeePlansTap.mutationOptions(),
  )
  return useMemo(() => {
    const emit = (input: GrowthIntentInput) => {
      try {
        const event = growthIntentEvent(input)
        if (event) trackProductEvent(event.name, event.properties)
        if (isSeePlansTap(input) && input.feature !== "home")
          mutate(
            { feature: input.feature as CountedFeature },
            { onError: () => {} },
          )
      } catch {
        // Intent capture is observational and must never break the prompt.
      }
    }
    return {
      sheetOpened(
        feature: GrowthIntentFeature,
        placement: GrowthIntentPlacement,
      ) {
        emit({
          name: "plan_sheet_opened",
          surface: "mobile",
          feature,
          placement,
        })
      },
      seePlans(feature: GrowthIntentFeature, placement: GrowthIntentPlacement) {
        emit({
          name: "upgrade_cta_clicked",
          surface: "mobile",
          feature,
          placement,
        })
      },
    }
  }, [mutate])
}
