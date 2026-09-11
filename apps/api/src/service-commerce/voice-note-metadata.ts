import {
  STORE_CONVERSATION_VOICE_NOTE_MAX_BYTES,
  STORE_CONVERSATION_VOICE_NOTE_MAX_DURATION_MS,
  STORE_CONVERSATION_VOICE_NOTE_MIN_DURATION_MS,
  type ServiceCommerceMediaMimeType,
  detectServiceCommerceMediaMimeType,
} from "@ewatrade/service-commerce"
import { parseBuffer } from "music-metadata"

export class StoreConversationVoiceNoteMetadataError extends Error {
  constructor(readonly code: "INVALID_AUDIO" | "TOO_LARGE" | "TOO_LONG") {
    super(
      code === "TOO_LARGE"
        ? "This voice note is too large."
        : code === "TOO_LONG"
          ? "Voice notes can be up to 60 seconds."
          : "This voice note could not be verified.",
    )
    this.name = "StoreConversationVoiceNoteMetadataError"
  }
}

export async function inspectStoreConversationVoiceNote(input: {
  bytes: Uint8Array
  declaredMimeType: string
}) {
  if (input.bytes.byteLength > STORE_CONVERSATION_VOICE_NOTE_MAX_BYTES) {
    throw new StoreConversationVoiceNoteMetadataError("TOO_LARGE")
  }
  const mimeType = detectServiceCommerceMediaMimeType(input.bytes)
  if (!mimeType?.startsWith("audio/") || mimeType !== input.declaredMimeType) {
    throw new StoreConversationVoiceNoteMetadataError("INVALID_AUDIO")
  }

  try {
    const metadata = await parseBuffer(
      input.bytes,
      { mimeType, size: input.bytes.byteLength },
      { duration: true, skipCovers: true },
    )
    const durationMs = Math.round((metadata.format.duration ?? 0) * 1_000)
    if (
      !Number.isFinite(durationMs) ||
      durationMs < STORE_CONVERSATION_VOICE_NOTE_MIN_DURATION_MS
    ) {
      throw new StoreConversationVoiceNoteMetadataError("INVALID_AUDIO")
    }
    if (durationMs > STORE_CONVERSATION_VOICE_NOTE_MAX_DURATION_MS) {
      throw new StoreConversationVoiceNoteMetadataError("TOO_LONG")
    }
    return {
      durationMs,
      mimeType: mimeType as ServiceCommerceMediaMimeType,
    }
  } catch (error) {
    if (error instanceof StoreConversationVoiceNoteMetadataError) throw error
    throw new StoreConversationVoiceNoteMetadataError("INVALID_AUDIO")
  }
}
