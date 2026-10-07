import type { EventMetadata } from "@ewatrade/events/metadata"

type Track = (name: string, properties: EventMetadata) => void
type FailureStatus = "validation_error" | "http_error" | "request_error"

export function createLeadCaptureAnalytics(type: "early-access" | "waitlist") {
  let started = false
  const properties = {
    surface: "marketing",
    category: type === "early-access" ? "early_access" : "waitlist",
  }

  function emit(track: Track, name: string, outcome: EventMetadata = {}) {
    try {
      track(name, { ...properties, ...outcome })
    } catch {
      // Optional analytics must never interrupt intake or its success feedback.
    }
  }

  return {
    start(track: Track) {
      if (started) return
      started = true
      emit(track, "marketing_form_started")
    },
    submitted(track: Track) {
      emit(track, "marketing_form_submitted", {
        status: "accepted",
        success: true,
      })
      started = false
    },
    failed(track: Track, status: FailureStatus) {
      emit(track, "marketing_form_failed", { status, success: false })
    },
  }
}
