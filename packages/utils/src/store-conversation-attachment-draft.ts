export type StoreConversationAttachmentKind = "audio" | "document" | "image"

export type StoreConversationAttachmentPolicy = {
  acceptedMimeTypes: readonly string[]
  allowedKinds: readonly StoreConversationAttachmentKind[]
  maxAudioBytes?: number
  maxBytes: number
}

export type StoreConversationLocalAttachment = {
  kind: StoreConversationAttachmentKind
  /** Device-local only. Never include this value in logs or timeline projections. */
  localReference: string
  mimeType: string
  name: string
  size: number
}

export type StoreConversationAttachmentDraft = {
  failureMessage: string | null
  file: StoreConversationLocalAttachment
  operationId: string
  progress: number
  status: "failed" | "selected" | "uploading"
}

export type StoreConversationAttachmentDraftEvent =
  | { type: "upload_cancelled" }
  | { message: string; type: "upload_failed" }
  | { progress: number; type: "upload_progressed" }
  | { type: "upload_retried" }
  | { type: "upload_started" }

type CandidateFile = Omit<StoreConversationLocalAttachment, "kind">

export function createStoreConversationAttachmentDraft(input: {
  file: CandidateFile
  operationId: string
  policy: StoreConversationAttachmentPolicy
}):
  | { draft: StoreConversationAttachmentDraft; ok: true }
  | { message: string; ok: false } {
  const kind = resolveKind(input.file.mimeType)
  if (
    !kind ||
    !input.policy.allowedKinds.includes(kind) ||
    !input.policy.acceptedMimeTypes.includes(input.file.mimeType)
  ) {
    return {
      message: "This file type is not permitted for this Request.",
      ok: false,
    }
  }
  const maxBytes =
    kind === "audio"
      ? (input.policy.maxAudioBytes ?? input.policy.maxBytes)
      : input.policy.maxBytes
  if (input.file.size <= 0 || input.file.size > maxBytes) {
    return {
      message:
        kind === "audio"
          ? `Choose a voice note smaller than ${formatBytes(maxBytes)}.`
          : `Choose a file smaller than ${formatBytes(maxBytes)}.`,
      ok: false,
    }
  }
  return {
    draft: {
      failureMessage: null,
      file: { ...input.file, kind },
      operationId: input.operationId,
      progress: 0,
      status: "selected",
    },
    ok: true,
  }
}

export function reduceStoreConversationAttachmentDraft(
  draft: StoreConversationAttachmentDraft,
  event: StoreConversationAttachmentDraftEvent,
): StoreConversationAttachmentDraft {
  switch (event.type) {
    case "upload_started":
      return {
        ...draft,
        failureMessage: null,
        progress: 0,
        status: "uploading",
      }
    case "upload_progressed":
      return {
        ...draft,
        progress: Math.max(0, Math.min(100, Math.round(event.progress))),
      }
    case "upload_failed":
      return { ...draft, failureMessage: event.message, status: "failed" }
    case "upload_cancelled":
    case "upload_retried":
      return { ...draft, failureMessage: null, progress: 0, status: "selected" }
  }
}

export function resolveStoreConversationComposerAction(
  text: string,
  attachment: StoreConversationAttachmentDraft | null,
  disabled: boolean,
): "cancel" | "disabled" | "idle" | "send" {
  if (disabled) return "disabled"
  if (attachment?.status === "uploading") return "cancel"
  if (text.trim() || attachment?.status === "selected") return "send"
  return "idle"
}

function resolveKind(mimeType: string): StoreConversationAttachmentKind | null {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType === "application/pdf") return "document"
  if (mimeType.startsWith("audio/")) return "audio"
  return null
}

function formatBytes(bytes: number) {
  const megabytes = bytes / (1024 * 1024)
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`
}
