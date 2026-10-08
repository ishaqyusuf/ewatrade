import type { EventMetadata } from "@ewatrade/events/metadata"
import type {
  StoreInAMinuteChapterId,
  StoreInAMinuteMilestone,
  StoreInAMinuteVariant,
} from "./store-in-a-minute-video"

type Track = (name: string, properties: EventMetadata) => void

export type StoreInAMinuteContext = {
  chapter: StoreInAMinuteChapterId
  variant: StoreInAMinuteVariant
}

// The shared event metadata schema only accepts a fixed set of scalar fields,
// so the section maps onto them: category = section, channel = variant,
// action = chapter, item_count = progress percent, status = CTA destination.
export function createStoreInAMinuteAnalytics() {
  let viewed = false
  const progress = new Set<string>()

  function emit(
    track: Track,
    name: string,
    context: StoreInAMinuteContext,
    extra: EventMetadata = {},
  ) {
    try {
      track(name, {
        surface: "marketing",
        category: "store_in_a_minute",
        channel: context.variant,
        action: context.chapter,
        ...extra,
      })
    } catch {
      // Optional analytics must never interrupt playback.
    }
  }

  return {
    /** First playback in this page view. */
    view(track: Track, context: StoreInAMinuteContext) {
      if (viewed) return
      viewed = true
      emit(track, "video_view", context)
    },
    unmute(track: Track, context: StoreInAMinuteContext) {
      emit(track, "video_unmute", context)
    },
    variantSwitch(track: Track, context: StoreInAMinuteContext) {
      emit(track, "video_variant_switch", context)
    },
    chapterSelect(track: Track, context: StoreInAMinuteContext) {
      emit(track, "video_chapter_select", context)
    },
    /** Each milestone is sent once per variant. */
    progress(
      track: Track,
      context: StoreInAMinuteContext,
      milestones: readonly StoreInAMinuteMilestone[],
    ) {
      for (const milestone of milestones) {
        const key = `${context.variant}:${milestone}`
        if (progress.has(key)) continue
        progress.add(key)
        emit(track, "video_progress", context, { item_count: milestone })
      }
    },
    ctaClick(
      track: Track,
      context: StoreInAMinuteContext,
      destination: "signup" | "contact",
    ) {
      emit(track, "video_cta_click", context, { status: destination })
    },
  }
}
