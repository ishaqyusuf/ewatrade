import {
  SETUP_ATTACHMENTS_PER_CONVERSATION,
  SETUP_ATTACHMENTS_PER_MESSAGE,
  SETUP_ATTACHMENT_LIMITS,
  SETUP_ATTACHMENT_TYPES,
} from "@ewatrade/assistant/setup/attachments"

const MB = 1024 * 1024

/**
 * Files in the Ask box (owner-approved, 4 Nov 2026). Chat files are stored by
 * the setup attachment service, so where the owner's number is looser than
 * the server's the server's stricter one wins: PDFs stay at its 2 MB.
 */
export const ASSISTANT_ATTACHMENT_LIMITS = {
  perMessage: SETUP_ATTACHMENTS_PER_MESSAGE,
  perChat: SETUP_ATTACHMENTS_PER_CONVERSATION,
  photo: {
    /** As picked, before it is resized for upload. */
    maxBytes: 10 * MB,
    /** Longest edge sent; the photo reader gains nothing past this. */
    edge: 2048,
    types: SETUP_ATTACHMENT_TYPES.IMAGE as readonly string[],
  },
  pdf: {
    maxBytes: Math.min(5 * MB, SETUP_ATTACHMENT_LIMITS.PDF.maxBytes),
    maxPages: SETUP_ATTACHMENT_LIMITS.PDF.maxPages,
  },
} as const

const { pdf, photo, perMessage } = ASSISTANT_ATTACHMENT_LIMITS

export const ASSISTANT_ATTACHMENT_COPY = {
  full: `Up to ${perMessage} files per message`,
  photoTooLarge: `Choose a photo under ${photo.maxBytes / MB} MB.`,
  pdfTooLarge: `Choose a PDF under ${pdf.maxBytes / MB} MB and ${pdf.maxPages} pages.`,
  unsupported: "Send a photo or a PDF.",
} as const

export type AssistantFileCheck =
  | { ok: true; kind: "photo" | "pdf" }
  | { ok: false; error: string }

/** What a picked file may be: a photo or a PDF within its size limit. */
export function checkAssistantFile(file: {
  mimeType: string
  sizeBytes: number
}): AssistantFileCheck {
  const type = file.mimeType.toLowerCase()
  const kind = photo.types.includes(type)
    ? "photo"
    : type === "application/pdf"
      ? "pdf"
      : null
  if (!kind) return { ok: false, error: ASSISTANT_ATTACHMENT_COPY.unsupported }
  const limit = kind === "photo" ? photo.maxBytes : pdf.maxBytes
  if (!(file.sizeBytes > 0) || file.sizeBytes > limit)
    return {
      ok: false,
      error:
        kind === "photo"
          ? ASSISTANT_ATTACHMENT_COPY.photoTooLarge
          : ASSISTANT_ATTACHMENT_COPY.pdfTooLarge,
    }
  return { ok: true, kind }
}

/**
 * Pages in a PDF, read from its page objects, or null when they are packed
 * where a quick scan can't see them. The server counts every PDF properly;
 * this only lets the box refuse an obviously long one before it uploads.
 */
export function countPdfPages(bytes: Uint8Array): number | null {
  let text = ""
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  const pages = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0
  return pages > 0 ? pages : null
}
