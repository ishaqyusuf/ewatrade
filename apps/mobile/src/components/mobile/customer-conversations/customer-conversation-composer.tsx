import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import type {
  StoreConversationAttachmentDraft,
  StoreConversationAttachmentKind,
} from "@ewatrade/utils"
import { ArrowUp, Mic } from "lucide-react-native"
import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  CustomerAttachmentDraft,
  CustomerRestoredAttachmentAvatar,
} from "./customer-attachment-draft"
import { resolveCustomerAttachmentPickerPresentation } from "./customer-attachment-picker-presentation"
import { projectCustomerVoiceRecordingPresentation } from "./customer-voice-recording-presentation"
import type { CustomerVoiceState } from "./use-customer-voice-note"

const VOICE_WAVE_BAR_IDS = Array.from(
  { length: 20 },
  (_, index) => `voice-level-${index}`,
)

export function CustomerConversationComposer({
  disabled,
  disabledMessage = "Messaging is unavailable",
  draft,
  draftPreservation,
  attachment,
  attachmentKinds,
  attachmentNotice,
  attachmentTargets,
  hasActiveRequest,
  onCancelAttachment,
  onChangeDraft,
  onPickDocument,
  onPickImage,
  onRemoveAttachment,
  onRemoveRestoredAttachment,
  onRetryAttachment,
  onSelectAttachmentTarget,
  onTogglePrescriptionConsent,
  onCancelVoice,
  onDismissVoiceNotice,
  onSend,
  onStartVoice,
  onStopVoice,
  onToggleRequestIntent,
  pickerInitiallyOpen = false,
  sending,
  selectedAttachmentTargetKey,
  prescriptionConsentAccepted,
  prescriptionConsentRequired,
  restoredAttachmentKind,
  selectedAttachmentTargetLabel,
  startingNewRequest,
  storeName,
  voiceState,
  voicePreviewPlaybackEnabled = true,
  onHeightChange,
}: {
  attachment: StoreConversationAttachmentDraft | null
  attachmentKinds: StoreConversationAttachmentKind[]
  attachmentNotice: string | null
  attachmentTargets: Array<{ key: string; label: string }>
  disabled: boolean
  disabledMessage?: string
  draft: string
  draftPreservation: { detail: string; title: string } | null
  hasActiveRequest: boolean
  onCancelAttachment: () => void
  onChangeDraft: (value: string) => void
  onPickDocument?: () => void
  onPickImage: () => void
  onRemoveAttachment: () => void
  onRemoveRestoredAttachment: () => void
  onRetryAttachment: () => void
  onSelectAttachmentTarget: (key: string) => void
  onTogglePrescriptionConsent: () => void
  onCancelVoice: () => void
  onDismissVoiceNotice: () => void
  onSend: () => void
  onStartVoice: () => void
  onStopVoice: () => void
  onHeightChange: (height: number) => void
  onToggleRequestIntent: () => void
  pickerInitiallyOpen?: boolean
  sending: boolean
  selectedAttachmentTargetKey: string | null
  selectedAttachmentTargetLabel: string
  prescriptionConsentAccepted: boolean
  prescriptionConsentRequired: boolean
  restoredAttachmentKind: "audio" | "document" | "image" | null
  startingNewRequest: boolean
  storeName?: string
  voiceState: CustomerVoiceState
  voicePreviewPlaybackEnabled?: boolean
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const largeTextLayout = useLargeTextLayout()
  const { height: windowHeight } = useWindowDimensions()
  const [pickerOpen, setPickerOpen] = useState(pickerInitiallyOpen)
  const [messageInputHeight, setMessageInputHeight] = useState(
    largeTextLayout ? 72 : 24,
  )
  const attachmentUploading = attachment?.status === "uploading"
  const canSend =
    !disabled &&
    !sending &&
    !attachmentUploading &&
    Boolean(draft.trim() || attachment?.status === "selected")
  const imageAllowed = attachmentKinds.includes("image")
  const documentAllowed =
    attachmentKinds.includes("document") && Boolean(onPickDocument)
  const audioAllowed = attachmentKinds.includes("audio")
  const pickerPresentation = resolveCustomerAttachmentPickerPresentation({
    attachmentKinds,
    documentAvailable: Boolean(onPickDocument),
    requestLabel: selectedAttachmentTargetLabel,
  })
  const canRecord = !disabled && !sending && audioAllowed
  const recording = voiceState.kind === "recording"
  const voiceActive = recording || voiceState.kind === "requesting"
  const voicePresentation = voiceActive
    ? projectCustomerVoiceRecordingPresentation(voiceState)
    : null
  const composerContentMaxHeight = Math.max(220, windowHeight * 0.55)
  const composerBottomInset = Math.max(insets.bottom, 10)

  useEffect(() => {
    if (sending) setPickerOpen(false)
  }, [sending])

  useEffect(() => {
    if (largeTextLayout) {
      setMessageInputHeight((currentHeight) => Math.max(currentHeight, 72))
    }
  }, [largeTextLayout])

  return (
    <KeyboardStickyView
      offset={{ closed: 0, opened: 0 }}
      style={{ bottom: 0, left: 0, position: "absolute", right: 0, zIndex: 30 }}
    >
      <View
        onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
        style={{ paddingBottom: composerBottomInset }}
      >
        <View className="bg-background">
          <ScrollView
            contentContainerClassName="gap-2 px-3 pt-2"
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            onContentSizeChange={(_, contentHeight) =>
              onHeightChange(
                Math.min(contentHeight, composerContentMaxHeight) +
                  composerBottomInset,
              )
            }
            style={{ maxHeight: composerContentMaxHeight }}
          >
            {draftPreservation ? (
              <View
                accessible
                accessibilityLabel={`${draftPreservation.title}. ${draftPreservation.detail}`}
                className="min-h-8 flex-row items-center gap-2 px-2 py-1"
              >
                <Icon className="size-xs shrink-0 text-warn" name="Clock" />
                <View className="min-w-0 flex-1 flex-row flex-wrap gap-x-1">
                  <Text className="text-xs font-bold text-foreground">
                    {draftPreservation.title}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    · {draftPreservation.detail}
                  </Text>
                </View>
              </View>
            ) : null}
            {attachmentNotice ? (
              <Text
                accessibilityLiveRegion="polite"
                className="text-xs text-destructive"
              >
                {attachmentNotice}
              </Text>
            ) : null}
            {!disabled && attachmentTargets.length > 1 && !attachment ? (
              <View className="gap-1">
                <Text className="text-xs font-bold text-muted-foreground">
                  Choose a Request to attach media
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {attachmentTargets.map((target) => (
                    <Pressable
                      accessibilityRole="button"
                      className={
                        target.key === selectedAttachmentTargetKey
                          ? "min-h-11 justify-center rounded-full bg-primary px-4"
                          : "min-h-11 justify-center rounded-full border border-border px-4"
                      }
                      key={target.key}
                      onPress={() => onSelectAttachmentTarget(target.key)}
                    >
                      <Text
                        className={
                          target.key === selectedAttachmentTargetKey
                            ? "text-xs font-bold text-primary-foreground"
                            : "text-xs font-bold text-foreground"
                        }
                      >
                        {target.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {!disabled && prescriptionConsentRequired && !attachment ? (
              <Pressable
                accessibilityLabel="Consent to prescription media privacy processing"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: prescriptionConsentAccepted }}
                className="min-h-11 flex-row items-start gap-3 rounded-xl border border-border bg-card p-3"
                onPress={onTogglePrescriptionConsent}
              >
                <View
                  className={
                    prescriptionConsentAccepted
                      ? "mt-0.5 size-5 items-center justify-center rounded border border-primary bg-primary"
                      : "mt-0.5 size-5 rounded border border-border bg-background"
                  }
                >
                  {prescriptionConsentAccepted ? (
                    <Icon
                      className="size-xs text-primary-foreground"
                      name="Check"
                    />
                  ) : null}
                </View>
                <Text className="min-w-0 flex-1 text-xs leading-5 text-foreground">
                  I consent to this prescription image or PDF being privately
                  processed by this Store for my prescription Request.
                </Text>
              </Pressable>
            ) : null}
            {!disabled && pickerOpen && !attachment ? (
              <View
                accessibilityLabel="Choose a private attachment"
                className="gap-2 px-1"
              >
                <View className="gap-0.5 px-1 pb-1">
                  <Text className="text-sm font-bold text-foreground">
                    {pickerPresentation.title}
                  </Text>
                  <Text className="text-xs leading-4 text-muted-foreground">
                    {pickerPresentation.description}
                  </Text>
                </View>
                <View className="border-t border-border">
                  {pickerPresentation.items.map((item) => (
                    <Pressable
                      accessibilityLabel={item.accessibilityLabel}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: sending }}
                      className="min-h-14 flex-row items-center gap-3 border-b border-border px-2 py-1.5"
                      disabled={sending}
                      key={item.kind}
                      onPress={() => {
                        setPickerOpen(false)
                        if (item.kind === "image") onPickImage()
                        else onPickDocument?.()
                      }}
                    >
                      <View className="size-9 items-center justify-center rounded-full bg-muted">
                        <Icon
                          className="size-sm text-primary"
                          name={item.kind === "image" ? "Camera" : "FileText"}
                        />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-bold text-foreground">
                          {item.label}
                        </Text>
                        <Text className="text-xs leading-4 text-muted-foreground">
                          {item.description}
                        </Text>
                      </View>
                      <Icon
                        className="size-sm text-muted-foreground"
                        name="ChevronRight"
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {!disabled && hasActiveRequest ? (
              <Pressable
                accessibilityRole="button"
                className="min-h-9 self-end justify-center rounded-full border border-border px-3"
                disabled={disabled || sending}
                onPress={onToggleRequestIntent}
              >
                <Text className="text-xs font-bold text-foreground">
                  {startingNewRequest
                    ? "Continue current Request"
                    : "Start new Request"}
                </Text>
              </Pressable>
            ) : null}
            {voiceState.kind === "unavailable" ? (
              <View className="min-h-11 flex-row items-center gap-2 px-2">
                <Text
                  accessibilityLiveRegion="polite"
                  className="min-w-0 flex-1 text-xs text-destructive"
                >
                  {voiceState.message}
                </Text>
                <Pressable
                  accessibilityLabel="Dismiss voice note error"
                  accessibilityRole="button"
                  className="size-11 items-center justify-center rounded-full"
                  onPress={onDismissVoiceNotice}
                >
                  <Icon className="size-sm text-muted-foreground" name="X" />
                </Pressable>
              </View>
            ) : null}
            {attachment ? (
              <View
                className="flex-row flex-wrap gap-2 px-1"
                nativeID="attachments"
              >
                <CustomerAttachmentDraft
                  draft={attachment}
                  onCancel={onCancelAttachment}
                  onRemove={onRemoveAttachment}
                  onRetry={onRetryAttachment}
                  previewPlaybackEnabled={voicePreviewPlaybackEnabled}
                  requestLabel={selectedAttachmentTargetLabel}
                />
              </View>
            ) : null}
            {!attachment && restoredAttachmentKind ? (
              <View
                className="flex-row flex-wrap gap-2 px-1"
                nativeID="restored-attachments"
              >
                <CustomerRestoredAttachmentAvatar
                  kind={restoredAttachmentKind}
                  onRemove={onRemoveRestoredAttachment}
                />
              </View>
            ) : null}
            {voiceActive ? (
              <View
                accessibilityLabel={voicePresentation?.accessibilityLabel}
                accessibilityLiveRegion="polite"
                className="min-h-14 flex-row items-center gap-2 rounded-full border border-border bg-card px-1.5 py-1"
              >
                <Pressable
                  accessibilityLabel="Cancel voice note"
                  accessibilityRole="button"
                  className="size-11 shrink-0 items-center justify-center rounded-full"
                  onPress={onCancelVoice}
                >
                  <Icon className="size-sm text-muted-foreground" name="X" />
                </Pressable>
                {recording ? (
                  <View className="min-w-0 flex-1 flex-row items-center gap-2">
                    <View className="shrink-0 flex-row items-center gap-1.5">
                      <View className="size-2 rounded-full bg-destructive" />
                      <Text className="font-mono text-xs font-bold text-foreground">
                        {voicePresentation?.elapsedLabel}
                      </Text>
                    </View>
                    <View
                      accessibilityElementsHidden
                      className="h-9 min-w-0 flex-1 flex-row items-center justify-center gap-[2px] overflow-hidden"
                      importantForAccessibility="no-hide-descendants"
                    >
                      {VOICE_WAVE_BAR_IDS.map((id, index) => (
                        <View
                          key={id}
                          style={{
                            backgroundColor: colors.mutedForeground,
                            borderRadius: 999,
                            flexShrink: 0,
                            height:
                              6 +
                              (voicePresentation?.waveformLevels[index] ?? 0) *
                                26,
                            width: 3,
                          }}
                        />
                      ))}
                    </View>
                  </View>
                ) : (
                  <View className="min-w-0 flex-1 flex-row items-center justify-center gap-2">
                    <ActivityIndicator accessibilityLabel="Preparing recorder" />
                    <Text className="text-xs font-bold text-muted-foreground">
                      {voicePresentation?.elapsedLabel}
                    </Text>
                  </View>
                )}
                <Pressable
                  accessibilityLabel={voicePresentation?.actionLabel}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !voicePresentation?.ready }}
                  className={
                    voicePresentation?.ready
                      ? "h-11 min-w-16 shrink-0 items-center justify-center rounded-full bg-primary px-4"
                      : "h-11 min-w-16 shrink-0 items-center justify-center rounded-full bg-muted px-4"
                  }
                  haptic
                  disabled={!voicePresentation?.ready}
                  onPress={onStopVoice}
                >
                  <Text
                    className={
                      voicePresentation?.ready
                        ? "text-xs font-bold text-primary-foreground"
                        : "text-xs font-bold text-muted-foreground"
                    }
                  >
                    {voicePresentation?.actionText}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View
                className={`min-h-14 flex-row gap-1 rounded-[28px] border border-border bg-card px-1.5 py-1 ${
                  messageInputHeight > 32 ? "items-end" : "items-center"
                }`}
                nativeID="chatContainer"
              >
                <Pressable
                  accessibilityLabel={
                    pickerOpen
                      ? "Close private attachments"
                      : disabled ||
                          attachmentTargets.length === 0 ||
                          !selectedAttachmentTargetKey ||
                          (prescriptionConsentRequired &&
                            !prescriptionConsentAccepted) ||
                          (!imageAllowed && !documentAllowed)
                        ? "Private attachments unavailable"
                        : "Add a private attachment"
                  }
                  accessibilityRole="button"
                  accessibilityState={{ expanded: pickerOpen }}
                  className="size-11 shrink-0 items-center justify-center rounded-full"
                  disabled={
                    disabled ||
                    sending ||
                    Boolean(attachment) ||
                    attachmentTargets.length === 0 ||
                    !selectedAttachmentTargetKey ||
                    (prescriptionConsentRequired &&
                      !prescriptionConsentAccepted) ||
                    (!imageAllowed && !documentAllowed)
                  }
                  onPress={() => setPickerOpen((current) => !current)}
                >
                  <Icon
                    className={
                      pickerOpen
                        ? "size-sm text-primary"
                        : "size-sm text-muted-foreground"
                    }
                    name={pickerOpen ? "X" : "Plus"}
                  />
                </Pressable>
                <View className="min-w-0 flex-1 px-2">
                  <TextInput
                    accessibilityLabel="Message the Store"
                    editable={!disabled && !sending}
                    maxLength={2_000}
                    multiline
                    onChangeText={onChangeDraft}
                    onContentSizeChange={(event) => {
                      const contentHeight = Math.ceil(
                        event.nativeEvent.contentSize.height,
                      )
                      setMessageInputHeight(
                        contentHeight <= (largeTextLayout ? 80 : 32)
                          ? largeTextLayout
                            ? 72
                            : 24
                          : Math.min(120, Math.max(48, contentHeight)),
                      )
                    }}
                    placeholder={
                      disabled
                        ? disabledMessage
                        : `Message ${storeName || "the Store"}`
                    }
                    placeholderTextColor={colors.mutedForeground}
                    selectionColor={colors.primary}
                    style={{
                      color: colors.foreground,
                      fontSize: 16,
                      height: messageInputHeight,
                      includeFontPadding: false,
                      lineHeight: 24,
                      paddingBottom: 0,
                      paddingTop: 0,
                      textAlignVertical:
                        messageInputHeight > 32 ? "top" : "center",
                    }}
                    value={draft}
                  />
                </View>
                <Pressable
                  accessibilityLabel={
                    canSend
                      ? sending
                        ? "Sending message"
                        : "Send message"
                      : disabled
                        ? disabledMessage
                        : "Record a voice note"
                  }
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: !canSend && !canRecord,
                  }}
                  className={
                    canSend
                      ? "size-11 shrink-0 items-center justify-center rounded-full bg-primary"
                      : "size-11 shrink-0 items-center justify-center rounded-full"
                  }
                  disabled={!canSend && !canRecord}
                  haptic
                  onPress={canSend ? onSend : onStartVoice}
                >
                  <Icon
                    as={canSend ? ArrowUp : Mic}
                    className={
                      canSend
                        ? "size-sm text-primary-foreground"
                        : "size-sm text-muted-foreground"
                    }
                  />
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </KeyboardStickyView>
  )
}
