import {
  SETUP_ATTACHMENT_PART,
  type SetupAttachmentExtraction,
  type SetupAttachmentKind,
  type SetupAttachmentPartData,
  setupAttachmentExtractionSchema,
  setupAttachmentModelText,
  summarizeSetupAttachment,
} from "@ewatrade/assistant/setup/attachments"

export type ChatAttachmentRow = {
  id: string
  conversationId: string
  messageId: string | null
  kind: SetupAttachmentKind
  status: string
  fileName: string
  durationMs: number | null
  transcript: string | null
  extraction: unknown
}

type StoredPart = { type: string; text?: string; data?: unknown }
type StoredMessage = { id: string; role: string; parts: StoredPart[] }

function extraction(row: ChatAttachmentRow): SetupAttachmentExtraction | null {
  const parsed = setupAttachmentExtractionSchema.safeParse(row.extraction)
  return parsed.success ? parsed.data : null
}

/** Attachment ids referenced by stored `data-setup-attachment` parts. */
export function referencedAttachmentIds(messages: StoredMessage[]) {
  const ids = new Set<string>()
  for (const message of messages)
    for (const part of message.parts)
      if (part.type === SETUP_ATTACHMENT_PART) {
        const id = (part.data as { attachmentId?: unknown } | undefined)
          ?.attachmentId
        if (typeof id === "string") ids.add(id)
      }
  return [...ids]
}

/**
 * Why a set of attachments cannot be sent now, if any. The binding inside the
 * run transaction re-checks the same facts against concurrent sends.
 */
export function attachmentSendRefusal(
  rows: ChatAttachmentRow[],
  input: { conversationId: string; messageId: string; requested: string[] },
) {
  if (rows.length !== input.requested.length) return "ATTACHMENT_NOT_FOUND"
  for (const row of rows) {
    if (row.conversationId !== input.conversationId)
      return "ATTACHMENT_NOT_FOUND"
    if (row.status !== "READY") return "ATTACHMENT_NOT_READY"
    if (row.messageId && row.messageId !== input.messageId)
      return "ATTACHMENT_ALREADY_SENT"
  }
  return null
}

/** Stored user parts: the owner's text, then display-safe attachment summaries. */
export function storedUserParts(
  textParts: Array<{ type: "text"; text: string }>,
  rows: ChatAttachmentRow[],
  order: string[],
) {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const attachments = order.flatMap((id) => {
    const row = byId.get(id)
    if (!row) return []
    const data: SetupAttachmentPartData = {
      attachmentId: row.id,
      kind: row.kind,
      fileName: row.fileName,
      summary: summarizeSetupAttachment({
        kind: row.kind,
        durationMs: row.durationMs,
        extraction: extraction(row),
      }),
    }
    return [{ type: SETUP_ATTACHMENT_PART, data }]
  })
  return [...textParts, ...attachments]
}

/**
 * Replaces attachment parts with delimited, untrusted text for the model. The
 * latest few attachments carry their content; older ones a one-line note so
 * history stays bounded.
 */
export function withAttachmentText<M extends StoredMessage>(
  messages: M[],
  rows: ChatAttachmentRow[],
  options: { fullAttachments?: number; maxCharsEach?: number } = {},
): M[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const full = new Set(
    referencedAttachmentIds(messages).slice(-(options.fullAttachments ?? 4)),
  )
  return messages.map((message) => {
    if (!message.parts.some((part) => part.type === SETUP_ATTACHMENT_PART))
      return message
    const hasOwnerText = message.parts.some(
      (part) => part.type === "text" && part.text?.trim(),
    )
    const parts = message.parts.map((part) => {
      if (part.type !== SETUP_ATTACHMENT_PART) return part
      const data = part.data as Partial<SetupAttachmentPartData> | undefined
      const row = data?.attachmentId ? byId.get(data.attachmentId) : undefined
      if (!row)
        return {
          type: "text",
          text: `(an attachment that is no longer available: ${data?.fileName ?? "file"})`,
        }
      if (!full.has(row.id))
        return {
          type: "text",
          text: `(earlier attachment ${row.fileName}, already used above: ${data?.summary ?? row.kind.toLowerCase()})`,
        }
      return {
        type: "text",
        text: setupAttachmentModelText(
          {
            id: row.id,
            kind: row.kind,
            fileName: row.fileName,
            transcript: hasOwnerText ? null : row.transcript,
            extraction: extraction(row),
          },
          options.maxCharsEach,
        ),
      }
    })
    return { ...message, parts }
  })
}

/** What draft tools may cite: attachments sent in this conversation. */
export function knownAttachments(rows: ChatAttachmentRow[]) {
  return rows.map((row) => {
    const read = extraction(row)
    return {
      id: row.id,
      kind: row.kind,
      imageKind: read?.type === "image" ? read.imageKind : null,
    }
  })
}
