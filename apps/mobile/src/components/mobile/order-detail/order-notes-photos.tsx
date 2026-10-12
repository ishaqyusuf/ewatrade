import { formatCommerceDateTime } from "@/components/mobile/commerce/commerce-model"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { orderAttachmentSource } from "@/lib/order-attachment-upload"
import { cn } from "@/lib/utils"
import { Image } from "expo-image"
import { VideoView, useVideoPlayer } from "expo-video"
import { useState } from "react"
import {
  Alert,
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
  const [viewing, setViewing] = useState<{
    id: string
    video: boolean
  } | null>(null)
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
            fontSize: 15,
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
            disabled={isOffline || !model.canAddFiles}
            icon="Camera"
            label="Take photo"
            onPress={() => void model.pickPhoto("camera")}
          />
          <ComposerButton
            disabled={isOffline || !model.canAddFiles}
            icon="Image"
            label="Choose photo"
            onPress={() => void model.pickPhoto("library")}
          />
          <ComposerButton
            disabled={isOffline || !model.canAddFiles}
            icon="Video"
            label="Add video"
            onPress={() =>
              Alert.alert("Add a video", "Up to one minute.", [
                {
                  text: "Record video",
                  onPress: () => void model.pickVideo("camera"),
                },
                {
                  text: "Choose video",
                  onPress: () => void model.pickVideo("library"),
                },
                { style: "cancel", text: "Cancel" },
              ])
            }
          />
          <ComposerButton
            disabled={isOffline || !model.canAddFiles}
            icon="FileText"
            label="Attach PDF"
            onPress={() => void model.pickDocument()}
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
                fontSize: 14,
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
                <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
                  {entry.actor?.name ?? "Team member"}
                  {entry.source === "assistant" ? " · via assistant" : ""}
                </Text>
                <Text className="text-xs tabular-nums text-muted-foreground">
                  {formatCommerceDateTime(entry.createdAt)}
                </Text>
              </View>
              {entry.body ? (
                <Text className="text-sm leading-5 text-foreground" selectable>
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
                        <Text className="text-[10px] text-muted-foreground">
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
      <AttachmentViewer viewing={viewing} onClose={() => setViewing(null)} />
    </View>
  )
}

function ComposerButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled: boolean
  icon: IconKeys
  label: string
  onPress: () => void
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      haptic
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.accent,
        borderRadius: 12,
        height: 40,
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
        width: 44,
      }}
    >
      <Icon
        className="size-[18px]"
        color={colors.accentForeground}
        name={icon}
      />
    </Pressable>
  )
}

function PdfTile({ name }: { name: string }) {
  return (
    <View className="h-16 w-28 justify-center gap-1 rounded-xl bg-muted px-2.5">
      <Icon className="size-[16px] text-muted-foreground" name="FileText" />
      <Text className="text-[11px] text-foreground" numberOfLines={1}>
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
