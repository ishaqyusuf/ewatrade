import { AttachmentLockSheet } from "@/components/mobile/attachment-lock-sheet"
import { formatCommerceDateTime } from "@/components/mobile/commerce/commerce-model"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal as SheetModal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAttachmentEntitlement } from "@/hooks/use-attachment-entitlement"
import { useColors } from "@/hooks/use-color"
import { orderAttachmentSource } from "@/lib/order-attachment-upload"
import { cn } from "@/lib/utils"
import { trackMobileActivity } from "@/runtime/analytics-runtime"
import { BottomSheetView } from "@gorhom/bottom-sheet"
import { Image } from "expo-image"
import { VideoView, useVideoPlayer } from "expo-video"
import { useEffect, useRef, useState } from "react"
import {
  Modal,
  Text as NativeText,
  View as NativeView,
  TextInput,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useOrderActivity } from "./use-order-activity"

/**
 * Staff notes, photos, PDFs and videos on an order: a composer above a
 * newest-first list. Works only online; uploads finish before the entry is
 * shown complete.
 */
export function OrderNotesAndPhotos({
  orderId,
  isOffline,
}: {
  orderId: string
  isOffline: boolean
}) {
  const colors = useColors()
  const model = useOrderActivity(orderId, isOffline)
  // Free-plan lock: controls stay visible; media actions recheck the plan
  // right before opening and explain the lock instead when it applies.
  const access = useAttachmentEntitlement({
    surface: "order",
    track: trackMobileActivity,
  })
  const locked = access.entitlement.status === "locked"
  const mediaDisabled =
    isOffline ||
    (!locked && (access.entitlement.status !== "allowed" || !model.canAddFiles))
  const [viewing, setViewing] = useState<{
    id: string
    video: boolean
  } | null>(null)
  const videoSheet = useModal()
  const videoSession = useRef<{
    orderId: string
    retired: boolean
    attempt: typeof access.attempt
    source: "camera" | "library" | null
  } | null>(null)
  const videoMounted = useRef(true)
  const latestVideo = useRef({
    access,
    model,
    mediaDisabled,
    isOffline,
    orderId,
  })
  latestVideo.current = { access, model, mediaDisabled, isOffline, orderId }

  // Retire the chooser when its Order or available attachment controls change.
  useEffect(() => {
    if (
      videoSession.current &&
      !videoSession.current.retired &&
      (videoSession.current.orderId !== orderId ||
        access.entitlement.status !== "allowed" ||
        mediaDisabled)
    ) {
      videoSession.current.retired = true
      videoSession.current.source = null
      videoSheet.dismiss()
    }
  }, [orderId, access.entitlement.status, mediaDisabled, videoSheet.dismiss])
  useEffect(() => {
    videoMounted.current = true
    return () => {
      videoMounted.current = false
      videoSession.current = null
      videoSheet.dismiss()
    }
  }, [videoSheet.dismiss])

  function openVideoSheet() {
    if (videoSession.current) return
    videoSession.current = {
      orderId,
      retired: false,
      attempt: access.attempt,
      source: null,
    }
    videoSheet.present()
  }

  function chooseVideo(source: "camera" | "library") {
    const session = videoSession.current
    const live = latestVideo.current
    if (
      !session ||
      session.retired ||
      session.source ||
      session.orderId !== live.orderId ||
      live.mediaDisabled ||
      live.isOffline
    )
      return
    session.source = source
    videoSheet.dismiss()
  }

  function finishVideoDismissal() {
    const session = videoSession.current
    videoSession.current = null
    const live = latestVideo.current
    if (
      !videoMounted.current ||
      !session?.source ||
      session.retired ||
      session.orderId !== live.orderId ||
      live.isOffline ||
      live.mediaDisabled ||
      live.access.entitlement.status !== "allowed"
    )
      return
    const source = session.source
    // The native sheet is gone. Recheck using the opening render's attempt:
    // its captured lifetime rejects session changes and offline round trips.
    void session.attempt(() => {
      const current = latestVideo.current
      if (
        !videoMounted.current ||
        session.orderId !== current.orderId ||
        current.isOffline ||
        current.mediaDisabled
      )
        return
      return current.model.pickVideo(source)
    }, "video")
  }
  const entries = [...model.entries].reverse()
  const canPost =
    !isOffline &&
    !model.isPosting &&
    (model.body.trim().length > 0 || model.files.length > 0)
  return (
    <View className="gap-2">
      <Text className="text-base font-extrabold text-foreground">
        Notes & photos
      </Text>
      <View className="gap-3 rounded-[20px] bg-card p-3.5 shadow-sm">
        {isOffline ? (
          <Text className="text-xs text-muted-foreground">
            Connect to add notes or photos to this order.
          </Text>
        ) : null}
        <TextInput
          accessibilityLabel="Order note"
          editable={!isOffline && !model.isPosting}
          maxFontSizeMultiplier={1.3}
          maxLength={2000}
          multiline
          onChangeText={model.setBody}
          placeholder="Add a note — what happened, what was agreed…"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          style={{
            backgroundColor: colors.muted,
            borderRadius: 14,
            color: colors.foreground,
            fontSize: 16,
            minHeight: 64,
            paddingHorizontal: 14,
            paddingVertical: 12,
            textAlignVertical: "top",
          }}
          testID="order-note-input"
          value={model.body}
        />
        {model.files.length ? (
          <View className="flex-row flex-wrap gap-2">
            {model.files.map((file) => (
              <View key={file.id} className="relative">
                {file.mimeType === "application/pdf" ? (
                  <PdfTile name={file.fileName} />
                ) : file.mimeType.startsWith("video/") ? (
                  <VideoTile />
                ) : (
                  <Image
                    accessibilityLabel={file.fileName}
                    contentFit="cover"
                    source={{ uri: file.uri }}
                    style={{ borderRadius: 12, height: 64, width: 64 }}
                  />
                )}
                <Pressable
                  accessibilityLabel={`Remove ${file.fileName}`}
                  accessibilityRole="button"
                  className="absolute -right-1.5 -top-1.5 size-6 items-center justify-center rounded-full bg-foreground"
                  disabled={model.isPosting}
                  hitSlop={6}
                  onPress={() => model.removeFile(file.id)}
                >
                  <Icon className="size-[12px] text-background" name="X" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {model.error ? (
          <StatusBanner
            icon="AlertCircle"
            message={model.error}
            title="Not saved yet"
            tone="destructive"
          />
        ) : null}
        <View className="flex-row items-center gap-2">
          <ComposerButton
            disabled={mediaDisabled}
            icon="Camera"
            label="Take photo"
            locked={locked}
            onPress={() =>
              void access.attempt(() => model.pickPhoto("camera"), "camera")
            }
          />
          <ComposerButton
            disabled={mediaDisabled}
            icon="Image"
            label="Choose photo"
            locked={locked}
            onPress={() =>
              void access.attempt(() => model.pickPhoto("library"), "gallery")
            }
          />
          <ComposerButton
            disabled={mediaDisabled}
            icon="Video"
            label="Add video"
            locked={locked}
            onPress={() => void access.attempt(openVideoSheet, "video")}
          />
          <ComposerButton
            disabled={mediaDisabled}
            icon="FileText"
            label="Attach PDF"
            locked={locked}
            onPress={() =>
              void access.attempt(() => model.pickDocument(), "document")
            }
          />
          <View className="flex-1" />
          <Pressable
            accessibilityLabel="Post note"
            accessibilityRole="button"
            accessibilityState={{ busy: model.isPosting, disabled: !canPost }}
            disabled={!canPost}
            haptic
            onPress={() => void model.post()}
            style={{
              alignItems: "center",
              backgroundColor: canPost ? colors.primary : colors.muted,
              borderRadius: 12,
              height: 40,
              justifyContent: "center",
              paddingHorizontal: 16,
            }}
            testID="order-note-post"
          >
            <NativeText
              style={{
                color: canPost
                  ? colors.primaryForeground
                  : colors.mutedForeground,
                fontSize: 16,
                fontWeight: "800",
              }}
            >
              {model.isPosting
                ? model.progress !== null
                  ? `${Math.round(model.progress)}%`
                  : "Saving…"
                : "Post"}
            </NativeText>
          </Pressable>
        </View>
      </View>
      {model.loadError ? (
        <Text className="text-xs text-muted-foreground">
          Notes could not load: {model.loadError}
        </Text>
      ) : null}
      {entries.length ? (
        <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
          {entries.map((entry, index) => (
            <View
              key={entry.id}
              className={cn(
                "gap-1.5 py-3",
                index > 0 && "border-t border-border",
              )}
              testID={`order-activity-entry-${index}`}
            >
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className="min-w-0 flex-1 text-base font-bold text-foreground">
                  {entry.actor?.name ?? "Team member"}
                  {entry.source === "assistant" ? " · via assistant" : ""}
                </Text>
                <Text className="text-xs tabular-nums text-muted-foreground">
                  {formatCommerceDateTime(entry.createdAt)}
                </Text>
              </View>
              {entry.body ? (
                <Text className="text-base text-foreground" selectable>
                  {entry.body}
                </Text>
              ) : null}
              {entry.attachments.length ? (
                <View className="flex-row flex-wrap gap-2 pt-1">
                  {entry.attachments.map((attachment) =>
                    attachment.status !== "READY" ? (
                      <View
                        key={attachment.id}
                        className="size-16 items-center justify-center rounded-xl bg-muted"
                      >
                        <Text className="text-xs text-muted-foreground">
                          Uploading
                        </Text>
                      </View>
                    ) : attachment.kind === "DOCUMENT" ? (
                      <PdfTile
                        key={attachment.id}
                        name={attachment.originalFileName ?? "PDF"}
                      />
                    ) : attachment.kind === "VIDEO" ? (
                      <Pressable
                        key={attachment.id}
                        accessibilityLabel="Play video"
                        accessibilityRole="button"
                        haptic
                        onPress={() =>
                          setViewing({ id: attachment.id, video: true })
                        }
                      >
                        <VideoTile playable />
                      </Pressable>
                    ) : (
                      <Pressable
                        key={attachment.id}
                        accessibilityLabel="View photo"
                        accessibilityRole="imagebutton"
                        onPress={() =>
                          setViewing({ id: attachment.id, video: false })
                        }
                      >
                        <Image
                          contentFit="cover"
                          source={orderAttachmentSource(attachment.id)}
                          style={{ borderRadius: 12, height: 64, width: 64 }}
                        />
                      </Pressable>
                    ),
                  )}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {!isOffline &&
      (access.entitlement.status === "checking" ||
        access.entitlement.status === "unknown") ? (
        <Text className="text-xs text-muted-foreground">
          {access.entitlement.status === "checking"
            ? "Checking your plan… Photo, video and PDF options open once it's confirmed."
            : "Couldn't confirm your plan, so photo, video and PDF options are off for now. Notes still save."}
        </Text>
      ) : null}
      <SheetModal
        accessibilityLabel="Add a video"
        enableDynamicSizing
        onDismiss={finishVideoDismissal}
        ref={videoSheet.ref}
        title="Add a video"
      >
        <BottomSheetView style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <Text className="pb-4 text-sm text-muted-foreground">
            Up to one minute.
          </Text>
          {(
            [
              { source: "camera", label: "Record video", icon: "Camera" },
              { source: "library", label: "Choose video", icon: "Image" },
            ] as const
          ).map(({ source, label, icon }) => (
            <Pressable
              accessibilityLabel={label}
              accessibilityRole="button"
              className="-mx-2 min-h-16 flex-row items-center gap-3 border-t border-border px-3 py-3 active:bg-accent"
              haptic
              key={source}
              onPress={() => chooseVideo(source)}
            >
              <View className="size-10 items-center justify-center rounded-full bg-muted">
                {/* Named sizes: IconImpl reads size-5 / size-4 as 5px / 4px. */}
                <Icon className="size-base text-muted-foreground" name={icon} />
              </View>
              <Text className="flex-1 text-base font-extrabold text-foreground">
                {label}
              </Text>
              <Icon
                className="size-sm text-muted-foreground"
                name="ChevronRight"
              />
            </Pressable>
          ))}
        </BottomSheetView>
      </SheetModal>
      <AttachmentViewer viewing={viewing} onClose={() => setViewing(null)} />
      <AttachmentLockSheet
        canSeePlans={access.sheet?.canSeePlans ?? false}
        onClose={access.closeSheet}
        onPromptAction={access.promptAction}
        onSeePlans={access.seePlans}
        open={access.sheet !== null}
        surface="order"
      />
    </View>
  )
}

function ComposerButton({
  disabled,
  icon,
  label,
  locked = false,
  onPress,
}: {
  disabled: boolean
  icon: IconKeys
  label: string
  /** Free plan: shown with a lock; pressing explains instead of opening. */
  locked?: boolean
  onPress: () => void
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityHint={
        locked ? "Explains why this isn't on the Free plan" : undefined
      }
      accessibilityLabel={locked ? `${label}, locked on the Free plan` : label}
      accessibilityRole="button"
      disabled={disabled}
      haptic
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: locked ? colors.muted : colors.accent,
        borderRadius: 12,
        height: 40,
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
        width: 44,
      }}
    >
      <Icon
        className="size-[18px]"
        color={locked ? colors.mutedForeground : colors.accentForeground}
        name={icon}
      />
      {locked ? (
        <View
          pointerEvents="none"
          className="absolute -right-1 -top-1 size-[18px] items-center justify-center rounded-full bg-tint-amber"
        >
          <Icon
            className="size-[11px] text-tint-amber-foreground"
            name="Lock"
          />
        </View>
      ) : null}
    </Pressable>
  )
}

function PdfTile({ name }: { name: string }) {
  return (
    <View className="h-16 w-28 justify-center gap-1 rounded-xl bg-muted px-2.5">
      <Icon className="size-[16px] text-muted-foreground" name="FileText" />
      <Text className="text-xs text-foreground" numberOfLines={1}>
        {name}
      </Text>
    </View>
  )
}

function VideoTile({ playable = false }: { playable?: boolean }) {
  const colors = useColors()
  return (
    <NativeView
      style={{
        alignItems: "center",
        backgroundColor: colors.foreground,
        borderRadius: 12,
        height: 64,
        justifyContent: "center",
        width: 64,
      }}
    >
      <Icon
        className="size-[22px]"
        color={colors.background}
        name={playable ? "Play" : "Video"}
      />
    </NativeView>
  )
}

/** Streams the video with the session's headers; the API supports seeking. */
function OrderVideo({ attachmentId }: { attachmentId: string }) {
  const player = useVideoPlayer(orderAttachmentSource(attachmentId), (video) =>
    video.play(),
  )
  return (
    <VideoView
      contentFit="contain"
      nativeControls
      player={player}
      style={{ flex: 1 }}
    />
  )
}

function AttachmentViewer({
  viewing,
  onClose,
}: {
  viewing: { id: string; video: boolean } | null
  onClose: () => void
}) {
  const attachmentId = viewing?.id ?? null
  const insets = useSafeAreaInsets()
  const colors = useColors()
  // Inline styles: className styling is not applied inside this native Modal.
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={attachmentId !== null}
    >
      <NativeView style={{ backgroundColor: colors.background, flex: 1 }}>
        {viewing?.video ? (
          <OrderVideo attachmentId={viewing.id} />
        ) : attachmentId ? (
          <Image
            accessibilityLabel="Order photo"
            contentFit="contain"
            source={orderAttachmentSource(attachmentId)}
            style={{ flex: 1 }}
          />
        ) : null}
        <Pressable
          accessibilityLabel={viewing?.video ? "Close video" : "Close photo"}
          accessibilityRole="button"
          haptic
          onPress={onClose}
          style={{
            alignItems: "center",
            backgroundColor: colors.card,
            borderRadius: 999,
            height: 44,
            justifyContent: "center",
            position: "absolute",
            right: 16,
            top: insets.top + 8,
            width: 44,
          }}
        >
          <Icon className="size-[20px]" color={colors.foreground} name="X" />
        </Pressable>
      </NativeView>
    </Modal>
  )
}
