import { describe, expect, test } from "bun:test"

import {
  chooseStoreConversationRecorderMimeType,
  formatStoreConversationVoiceElapsed,
} from "./use-store-conversation-voice-note"

describe("Store conversation web voice notes", () => {
  test("chooses only a server-accepted recorder format", () => {
    expect(
      chooseStoreConversationRecorderMimeType(
        ["audio/mp4", "audio/webm"],
        (mimeType) => mimeType === "audio/webm",
      ),
    ).toBe("audio/webm")
    expect(
      chooseStoreConversationRecorderMimeType(["audio/mp4"], () => false),
    ).toBeNull()
  })

  test("formats bounded elapsed time without raw timestamps", () => {
    expect(formatStoreConversationVoiceElapsed(0)).toBe("0:00")
    expect(formatStoreConversationVoiceElapsed(59_900)).toBe("0:59")
    expect(formatStoreConversationVoiceElapsed(60_000)).toBe("1:00")
  })
})
