import type { StoreConversationAttachmentDraft } from "@ewatrade/utils"

export function projectCustomerVoicePreviewPresentation(
  draft: StoreConversationAttachmentDraft,
  requestLabel: string,
) {
  const statusText =
    draft.status === "uploading"
      ? `${draft.progress}% uploaded`
      : draft.status === "failed"
        ? (draft.failureMessage ?? "Upload interrupted. Try again.")
        : "Ready to send privately"

  const accessibilityLabel = `${draft.file.name}. For ${requestLabel}. ${statusText}${statusText.endsWith(".") ? "" : "."}`

  return {
    accessibilityLabel,
    pauseLabel: `Pause voice note preview. ${accessibilityLabel}`,
    playLabel: `Play voice note preview. ${accessibilityLabel}`,
    removeLabel:
      draft.status === "uploading"
        ? `Cancel ${draft.file.name} upload`
        : `Remove ${draft.file.name}`,
    retryLabel: draft.status === "failed" ? `Retry ${draft.file.name}` : null,
  }
}
