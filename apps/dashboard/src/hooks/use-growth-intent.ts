"use client"

import { useTRPC } from "@/trpc/client"
import { useEvents } from "@ewatrade/events/client"
import {
  type GrowthIntentFeature,
  type GrowthIntentInput,
  type GrowthIntentPlacement,
  growthIntentEvent,
  isSeePlansTap,
} from "@ewatrade/events/growth-intent"
import { useMutation } from "@tanstack/react-query"
import { useMemo } from "react"

/**
 * Lifecycle intent signals for "See plans" prompts. Logly gets the fixed-label
 * event; locked-feature taps also bump the per-business counter the
 * feature-intent play reads. Never blocks or changes navigation.
 */
export function useGrowthIntent() {
  const events = useEvents()
  const trpc = useTRPC()
  const { mutate } = useMutation(
    trpc.growthIntent.recordSeePlansTap.mutationOptions(),
  )
  return useMemo(() => {
    const emit = (input: GrowthIntentInput) => {
      try {
        const event = growthIntentEvent(input)
        if (event) events.track(event.name, event.properties)
        if (isSeePlansTap(input) && input.feature !== "home")
          mutate(
            {
              feature: input.feature as Exclude<
                GrowthIntentFeature,
                "home" | "plan_billing"
              >,
            },
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
          surface: "dashboard",
          feature,
          placement,
        })
      },
      seePlans(feature: GrowthIntentFeature, placement: GrowthIntentPlacement) {
        emit({
          name: "upgrade_cta_clicked",
          surface: "dashboard",
          feature,
          placement,
        })
      },
    }
  }, [events, mutate])
}
