/**
 * Telegram media recognition (Workshop telegram-system 02, families 11–12).
 * Only the kind of media is read. File IDs, captions, names and contents are
 * never kept, and nothing is downloaded: the bot answers media with text.
 */

export type TelegramMediaKind =
  | "photo"
  | "document"
  | "video"
  | "audio"
  | "voice"
  | "video_note"

export type TelegramMedia = {
  media: TelegramMediaKind
  /** Telegram sends each album item as its own update with the same group ID. */
  mediaGroupId: string | null
  /** A photo or a photo/PDF document, which the EwaTrade chat accepts. */
  attachable: boolean
}

const order: readonly TelegramMediaKind[] = [
  "voice",
  "video_note",
  "photo",
  "video",
  "audio",
  "document",
]

const attachableDocument =
  /^(?:image\/(?:jpeg|png|webp|heic|heif)|application\/pdf)$/i

/** Media kind of a Telegram message, or null when it carries no supported media. */
export function readTelegramMedia(
  message: Record<string, unknown>,
): TelegramMedia | null {
  const media = order.find((kind) => {
    const value = message[kind]
    return kind === "photo"
      ? Array.isArray(value) && value.length > 0
      : typeof value === "object" && value !== null && !Array.isArray(value)
  })
  if (!media) return null
  const group = message.media_group_id
  const mimeType =
    media === "document"
      ? (message.document as Record<string, unknown>).mime_type
      : undefined
  return {
    media,
    mediaGroupId:
      typeof group === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(group)
        ? group
        : null,
    attachable:
      media === "photo" ||
      (typeof mimeType === "string" && attachableDocument.test(mimeType)),
  }
}
