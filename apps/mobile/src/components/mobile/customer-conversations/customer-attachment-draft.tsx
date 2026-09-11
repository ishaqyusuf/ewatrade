import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { View } from "@/components/ui/view"
import type { StoreConversationAttachmentDraft } from "@ewatrade/utils"
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio"
import { Image } from "expo-image"
import { Loader2, Mic, Pause, Play } from "lucide-react-native"
import { projectCustomerVoicePreviewPresentation } from "./customer-voice-preview-presentation"

export function CustomerAttachmentDraft({
  draft,
  onCancel,
  onRemove,
  onRetry,
  previewPlaybackEnabled = true,
  requestLabel,
}: {
  draft: StoreConversationAttachmentDraft
  onCancel: () => void
  onRemove: () => void
  onRetry: () => void
  previewPlaybackEnabled?: boolean
  requestLabel: string
}) {
  if (draft.file.kind === "audio") {
    return (
      <CustomerVoiceNoteDraft
        draft={draft}
        onCancel={onCancel}
        onRemove={onRemove}
        onRetry={onRetry}
        previewPlaybackEnabled={previewPlaybackEnabled}
        requestLabel={requestLabel}
      />
    )
  }

  return (
    <View
      accessibilityLabel={`${draft.file.name}. For ${requestLabel}. ${
        draft.status === "uploading"
          ? `${draft.progress}% uploaded`
          : draft.status === "failed"
            ? draft.failureMessage
            : "Ready to send"
      }`}
      className="relative size-14"
    >
      {draft.file.kind === "image" ? (
        <Image
          accessibilityLabel={`Preview of ${draft.file.name}`}
          className="size-14 rounded-full border border-border"
          contentFit="cover"
          source={draft.file.localReference}
        />
      ) : (
        <View className="size-14 items-center justify-center rounded-full border border-border bg-primary/10">
          <Icon className="size-sm text-primary" name="FileText" />
        </View>
      )}
      {draft.status === "uploading" ? (
        <View
          accessibilityLabel={`${draft.progress}% uploaded`}
          accessibilityRole="progressbar"
          accessibilityValue={{ max: 100, min: 0, now: draft.progress }}
          className="absolute inset-0 items-center justify-center rounded-full bg-background/70"
        >
          <Icon as={Loader2} className="size-sm animate-spin text-primary" />
        </View>
      ) : null}
      {draft.status === "failed" ? (
        <Pressable
          accessibilityLabel={`Retry ${draft.file.name}`}
          accessibilityRole="button"
          className="absolute -bottom-2 -left-2 size-11 items-center justify-center rounded-full border border-border bg-background"
          onPress={onRetry}
        >
          <Icon className="size-sm text-primary" name="RotateCw" />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel={
          draft.status === "uploading"
            ? `Cancel ${draft.file.name} upload`
            : `Remove ${draft.file.name}`
        }
        accessibilityRole="button"
        className="absolute -right-2 -top-2 size-11 items-center justify-center rounded-full border border-border bg-background"
        onPress={draft.status === "uploading" ? onCancel : onRemove}
      >
        <Icon className="size-sm text-muted-foreground" name="X" />
      </Pressable>
    </View>
  )
}

function CustomerVoiceNoteDraft({
  draft,
  onCancel,
  onRemove,
  onRetry,
  previewPlaybackEnabled,
  requestLabel,
}: {
  draft: StoreConversationAttachmentDraft
  onCancel: () => void
  onRemove: () => void
  onRetry: () => void
  previewPlaybackEnabled: boolean
  requestLabel: string
}) {
  const presentation = projectCustomerVoicePreviewPresentation(
    draft,
    requestLabel,
  )

  return (
    <View className="min-h-14 flex-row items-center gap-2 px-1">
      {draft.status === "uploading" ? (
        <View
          accessibilityLabel={presentation.accessibilityLabel}
          accessibilityRole="progressbar"
          accessibilityValue={{ max: 100, min: 0, now: draft.progress }}
          className="size-14 items-center justify-center rounded-full border border-border bg-primary/10"
        >
          <Icon as={Loader2} className="size-sm animate-spin text-primary" />
        </View>
      ) : (
        <CustomerVoiceNoteAvatar
          pauseLabel={presentation.pauseLabel}
          playLabel={presentation.playLabel}
          playbackEnabled={previewPlaybackEnabled}
          source={draft.file.localReference}
        />
      )}
      {presentation.retryLabel ? (
        <Pressable
          accessibilityLabel={presentation.retryLabel}
          accessibilityRole="button"
          className="size-11 shrink-0 items-center justify-center rounded-full border border-border bg-background"
          onPress={onRetry}
        >
          <Icon className="size-sm text-primary" name="RotateCw" />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel={presentation.removeLabel}
        accessibilityRole="button"
        className="size-11 shrink-0 items-center justify-center rounded-full border border-border bg-background"
        onPress={draft.status === "uploading" ? onCancel : onRemove}
      >
        <Icon className="size-sm text-muted-foreground" name="X" />
      </Pressable>
    </View>
  )
}

export function CustomerRestoredAttachmentAvatar({
  kind,
  onRemove,
}: {
  kind: "audio" | "document" | "image"
  onRemove: () => void
}) {
  return (
    <View
      accessibilityLabel={`Unsent ${kind} attachment restored. Reselect the file before sending.`}
      className="relative size-14"
    >
      <View className="size-14 items-center justify-center rounded-full border border-dashed border-border bg-primary/10">
        <Icon
          as={kind === "audio" ? Mic : undefined}
          className="size-sm text-primary"
          name={kind === "image" ? "Camera" : "FileText"}
        />
      </View>
      <Pressable
        accessibilityLabel={`Remove restored ${kind} attachment`}
        accessibilityRole="button"
        className="absolute -right-2 -top-2 size-11 items-center justify-center rounded-full border border-border bg-background"
        onPress={onRemove}
      >
        <Icon className="size-sm text-muted-foreground" name="X" />
      </Pressable>
    </View>
  )
}

function CustomerVoiceNoteAvatar({
  pauseLabel,
  playLabel,
  playbackEnabled,
  source,
}: {
  pauseLabel: string
  playLabel: string
  playbackEnabled: boolean
  source: string
}) {
  if (!playbackEnabled) {
    return (
      <Pressable
        accessibilityLabel={playLabel}
        accessibilityRole="button"
        className="size-14 shrink-0 items-center justify-center rounded-full border border-border bg-primary/10"
        onPress={() => undefined}
      >
        <Icon as={Play} className="size-sm text-primary" />
      </Pressable>
    )
  }

  return (
    <PlayableCustomerVoiceNoteAvatar
      pauseLabel={pauseLabel}
      playLabel={playLabel}
      source={source}
    />
  )
}

function PlayableCustomerVoiceNoteAvatar({
  pauseLabel,
  playLabel,
  source,
}: {
  pauseLabel: string
  playLabel: string
  source: string
}) {
  const player = useAudioPlayer(source)
  const status = useAudioPlayerStatus(player)
  return (
    <Pressable
      accessibilityLabel={status.playing ? pauseLabel : playLabel}
      accessibilityRole="button"
      className="size-14 shrink-0 items-center justify-center rounded-full border border-border bg-primary/10"
      onPress={() => {
        if (status.playing) player.pause()
        else {
          if (status.didJustFinish) void player.seekTo(0)
          player.play()
        }
      }}
    >
      <Icon
        as={status.playing ? Pause : Play}
        className="size-sm text-primary"
      />
    </Pressable>
  )
}
