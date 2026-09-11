import { describe, expect, test } from "bun:test"

import {
  StoreConversationVoiceNoteMetadataError,
  inspectStoreConversationVoiceNote,
} from "./voice-note-metadata"

function oneSecondSilentWav() {
  const sampleRate = 8_000
  const dataLength = sampleRate * 2
  const bytes = new Uint8Array(44 + dataLength)
  const view = new DataView(bytes.buffer)
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index)
    }
  }
  write(0, "RIFF")
  view.setUint32(4, 36 + dataLength, true)
  write(8, "WAVE")
  write(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, "data")
  view.setUint32(40, dataLength, true)
  return bytes
}

describe("Store Conversation voice metadata", () => {
  test("derives MIME and duration from the actual audio bytes", async () => {
    await expect(
      inspectStoreConversationVoiceNote({
        bytes: oneSecondSilentWav(),
        declaredMimeType: "audio/wav",
      }),
    ).resolves.toEqual({ durationMs: 1_000, mimeType: "audio/wav" })
  })

  test("rejects a mismatched claim and unparseable audio safely", async () => {
    await expect(
      inspectStoreConversationVoiceNote({
        bytes: oneSecondSilentWav(),
        declaredMimeType: "audio/webm",
      }),
    ).rejects.toBeInstanceOf(StoreConversationVoiceNoteMetadataError)
    await expect(
      inspectStoreConversationVoiceNote({
        bytes: new TextEncoder().encode("not audio"),
        declaredMimeType: "audio/wav",
      }),
    ).rejects.toMatchObject({ code: "INVALID_AUDIO" })
  })
})
