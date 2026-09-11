import { formatStoreConversationVoiceElapsed } from "@ewatrade/utils"

const MAX_VISIBLE_VOICE_LEVELS = 20

type CustomerVoiceRecordingPresentation = {
  accessibilityLabel: string
  actionLabel: string
  actionText: string
  elapsedLabel: string
  ready: boolean
  waveformLevels: number[]
}

export function projectCustomerVoiceRecordingPresentation(
  state:
    | { kind: "requesting" }
    | { elapsedMs: number; kind: "recording"; levels: number[] },
): CustomerVoiceRecordingPresentation {
  if (state.kind === "requesting") {
    return {
      accessibilityLabel: "Preparing voice recording",
      actionLabel: "Voice note is not ready",
      actionText: "Use",
      elapsedLabel: "Preparing",
      ready: false,
      waveformLevels: [],
    }
  }

  const elapsedLabel = formatStoreConversationVoiceElapsed(state.elapsedMs)
  return {
    accessibilityLabel: `Recording voice note, ${elapsedLabel}`,
    actionLabel: "Use voice note",
    actionText: "Use",
    elapsedLabel,
    ready: true,
    waveformLevels: state.levels.slice(-MAX_VISIBLE_VOICE_LEVELS),
  }
}
