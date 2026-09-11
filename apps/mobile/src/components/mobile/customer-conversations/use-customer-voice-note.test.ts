import { describe, expect, test } from "bun:test"

import {
  appendVoiceWaveformLevel,
  normalizeVoiceMetering,
} from "@/lib/customer-voice-waveform"
import { formatStoreConversationVoiceElapsed } from "@ewatrade/utils"

describe("Customer native voice notes", () => {
  test("formats the bounded recording duration", () => {
    expect(formatStoreConversationVoiceElapsed(0)).toBe("0:00")
    expect(formatStoreConversationVoiceElapsed(9_999)).toBe("0:09")
    expect(formatStoreConversationVoiceElapsed(60_000)).toBe("1:00")
  })

  test("turns real recorder metering into a bounded waveform history", () => {
    expect(normalizeVoiceMetering(-60)).toBe(0)
    expect(normalizeVoiceMetering(-30)).toBeCloseTo(0.607, 3)
    expect(normalizeVoiceMetering(0)).toBe(1)
    expect(normalizeVoiceMetering(undefined)).toBe(0)

    let levels: number[] = []
    for (let index = 0; index < 40; index += 1) {
      levels = appendVoiceWaveformLevel(levels, -30)
    }
    expect(levels).toHaveLength(28)
    expect(levels.every((level) => level > 0.6 && level < 0.61)).toBe(true)
  })
})
