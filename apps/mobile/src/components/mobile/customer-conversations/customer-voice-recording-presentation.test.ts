import { describe, expect, test } from "bun:test"

import { projectCustomerVoiceRecordingPresentation } from "./customer-voice-recording-presentation"

describe("projectCustomerVoiceRecordingPresentation", () => {
  test("projects one visible Use action with duration and a bounded waveform", () => {
    expect(
      projectCustomerVoiceRecordingPresentation({
        elapsedMs: 12_000,
        kind: "recording",
        levels: Array.from({ length: 28 }, (_, index) => index / 28),
      }),
    ).toEqual({
      accessibilityLabel: "Recording voice note, 0:12",
      actionLabel: "Use voice note",
      actionText: "Use",
      elapsedLabel: "0:12",
      ready: true,
      waveformLevels: Array.from(
        { length: 20 },
        (_, index) => (index + 8) / 28,
      ),
    })
  })

  test("keeps recorder preparation explicit and non-actionable", () => {
    expect(
      projectCustomerVoiceRecordingPresentation({ kind: "requesting" }),
    ).toEqual({
      accessibilityLabel: "Preparing voice recording",
      actionLabel: "Voice note is not ready",
      actionText: "Use",
      elapsedLabel: "Preparing",
      ready: false,
      waveformLevels: [],
    })
  })
})
