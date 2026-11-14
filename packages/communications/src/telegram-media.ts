/**
 * Telegram media recognition (Workshop telegram-system 02, families 11–12).
 * readTelegramMedia reads only the kind of media. readTelegramFile keeps the
 * file ID and caption of a single photo or photo/PDF document, so the
 * assistant can download and read a bank transfer receipt.
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

/** A photo or photo/PDF document the assistant may download (e.g. a transfer receipt). */
export type TelegramFile = {
  fileId: string
  fileUniqueId: string
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
  fileName: string
  /** Telegram's stated size; the download still checks the bytes. */
  sizeBytes: number | null
  caption: string | null
}

const MAX_TELEGRAM_FILE_BYTES = 5 * 1024 * 1024
const fileId = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{8,256}$/.test(value)
    ? value
    : null

const uniqueId = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)
    ? value
    : null

/**
 * File details for a single photo or photo/PDF document, read only when the
 * assistant downloads it. Other media, albums and oversized files give null.
 */
export function readTelegramFile(
  message: Record<string, unknown>,
): TelegramFile | null {
  if (message.media_group_id !== undefined) return null
  const caption =
    typeof message.caption === "string" && message.caption.length <= 1024
      ? message.caption.trim() || null
      : null
  const size = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? value
      : null
  if (Array.isArray(message.photo)) {
    // Sizes come smallest first; take the largest one within the limit.
    const sizes = message.photo
      .filter(
        (value): value is Record<string, unknown> =>
          typeof value === "object" && value !== null,
      )
      .filter(
        (value) => (size(value.file_size) ?? 0) <= MAX_TELEGRAM_FILE_BYTES,
      )
    const largest = sizes.at(-1)
    const id = fileId(largest?.file_id)
    const unique = uniqueId(largest?.file_unique_id) ?? id
    return id && unique
      ? {
          fileId: id,
          fileUniqueId: unique,
          contentType: "image/jpeg",
          fileName: "photo.jpg",
          sizeBytes: size(largest?.file_size),
          caption,
        }
      : null
  }
  const document = message.document
  if (typeof document !== "object" || document === null) return null
  const value = document as Record<string, unknown>
  const mime =
    typeof value.mime_type === "string" ? value.mime_type.toLowerCase() : ""
  const contentType = (
    ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const
  ).find((type) => type === mime)
  const id = fileId(value.file_id)
  const unique = uniqueId(value.file_unique_id) ?? id
  const bytes = size(value.file_size)
  if (!contentType || !id || !unique || (bytes ?? 0) > MAX_TELEGRAM_FILE_BYTES)
    return null
  const name =
    typeof value.file_name === "string"
      ? value.file_name.replace(/[^\w.\- ]/g, "_").slice(0, 120)
      : ""
  return {
    fileId: id,
    fileUniqueId: unique,
    contentType,
    fileName:
      name || (contentType === "application/pdf" ? "file.pdf" : "photo.jpg"),
    sizeBytes: bytes,
    caption,
  }
}
