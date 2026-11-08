import { useCustomerVoiceNote } from "@/components/mobile/customer-conversations/use-customer-voice-note"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/client"
import { formatStoreConversationVoiceElapsed } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { Image } from "expo-image"
import { type ComponentProps, useEffect, useRef, useState } from "react"
import { ActivityIndicator, BackHandler, StyleSheet } from "react-native"
import { ASSISTANT_ATTACHMENT_COPY } from "./assistant-attachment-limits"
import { AssistantComposer } from "./assistant-ui"
import {
  type AssistantReceipt,
  useAssistantReceipts,
} from "./use-assistant-receipts"

export type AssistantReadyFile = { attachmentId: string; fileName: string }

type ComposerProps = Omit<
  ComponentProps<typeof AssistantComposer>,
  "children" | "onAttach" | "attachOpen" | "voice" | "canSendEmpty"
>

/**
 * The business chat's box: + attaches receipt photos/PDFs (read before they
 * can be sent), the mic writes a voice note out into the box, Send sends.
 */
export function AssistantChatBox({
  conversationId,
  resetKey,
  onReadyChange,
  ...composer
}: ComposerProps & {
  conversationId: string | null
  /** Changes after a send so sent files leave the box. */
  resetKey: number
  onReadyChange: (files: AssistantReadyFile[]) => void
}) {
  const trpc = useTRPC()
  const [menuOpen, setMenuOpen] = useState(false)
  const [boxHeight, setBoxHeight] = useState(0)
  const capabilities = useQuery(
    trpc.setupAssistant.attachments.voiceCapabilities.queryOptions(undefined, {
      enabled: Boolean(conversationId),
      retry: false,
      staleTime: 30_000,
    }),
  )
  // What a sent file can be read as right now (photos need the vision model).
  const availability = useQuery(
    trpc.assistant.availability.queryOptions(undefined, {
      retry: false,
      staleTime: 30_000,
    }),
  ).data
  // An older API only says mediaEnabled.
  const media = availability?.media ?? {
    photos: true,
    files: availability?.mediaEnabled === true,
  }
  const valueRef = useRef(composer.value)
  valueRef.current = composer.value
  const onChangeRef = useRef(composer.onChange)
  onChangeRef.current = composer.onChange
  // "Stop and send": send once the written-out words reach the box.
  const sendWhenWritten = useRef(false)
  const [pendingSend, setPendingSend] = useState<{
    text: string
    conversationId: string | null
    resetKey: number
  } | null>(null)
  const receipts = useAssistantReceipts(
    conversationId ?? "",
    (text) => {
      const current = valueRef.current
      const next = current.trim() ? `${current.trimEnd()}\n${text}` : text
      onChangeRef.current(next)
      if (sendWhenWritten.current) {
        sendWhenWritten.current = false
        setPendingSend({ text: next, conversationId, resetKey })
      }
    },
    resetKey,
  )
  const { onSend, value } = composer
  useEffect(() => {
    if (
      !pendingSend ||
      pendingSend.conversationId !== conversationId ||
      pendingSend.resetKey !== resetKey ||
      value !== pendingSend.text
    )
      return
    setPendingSend(null)
    onSend()
  }, [pendingSend, value, onSend, conversationId, resetKey])
  const recorder = useCustomerVoiceNote({
    enabled: capabilities.data?.enabled === true && Boolean(conversationId),
    scopeKey: `${conversationId ?? "none"}:${resetKey}`,
    onReady: (file) => {
      void receipts.addRecording(file)
      return true
    },
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new composer scope resets transient controls.
  useEffect(() => {
    setMenuOpen(false)
    sendWhenWritten.current = false
    setPendingSend(null)
  }, [conversationId, resetKey])
  const readyKey = receipts.ready
    .map((file) => `${file.attachmentId}\u0000${file.fileName}`)
    .join("\u0001")
  const report = useRef(onReadyChange)
  report.current = onReadyChange
  useEffect(() => {
    report.current(
      readyKey
        ? readyKey.split("\u0001").map((entry) => {
            const [attachmentId = "", fileName = ""] = entry.split("\u0000")
            return { attachmentId, fileName }
          })
        : [],
    )
  }, [readyKey])

  const canAttach = Boolean(conversationId) && media?.files === true
  const canPhoto = media?.photos === true
  const canTalk = Boolean(conversationId) && capabilities.data?.enabled === true
  const state = recorder.state
  const pick = (source: "camera" | "library" | "file") => {
    setMenuOpen(false)
    void receipts.pick(source)
  }
  useEffect(() => {
    if (!menuOpen) return
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      setMenuOpen(false)
      return true
    })
    return () => back.remove()
  }, [menuOpen])
  return (
    <>
      <View onLayout={(event) => setBoxHeight(event.nativeEvent.layout.height)}>
        <AssistantComposer
          {...composer}
          canSendEmpty={receipts.ready.length > 0}
          onAttach={canAttach ? () => setMenuOpen((open) => !open) : undefined}
          attachOpen={menuOpen}
          voice={
            canTalk
              ? {
                  recording: state.kind === "recording",
                  // The meter ticks every 100ms; only ticks since the start show.
                  levels:
                    state.kind === "recording"
                      ? state.levels.slice(
                          state.levels.length -
                            Math.min(
                              state.levels.length,
                              Math.ceil(state.elapsedMs / 100),
                            ),
                        )
                      : undefined,
                  working: receipts.transcribing || state.kind === "requesting",
                  elapsedLabel:
                    state.kind === "recording"
                      ? formatStoreConversationVoiceElapsed(state.elapsedMs)
                      : "0:00",
                  status: receipts.transcribing
                    ? "Writing out your voice note…"
                    : state.kind === "requesting"
                      ? "Allow microphone access to begin."
                      : null,
                  error:
                    state.kind === "unavailable"
                      ? state.message
                      : (receipts.voiceError ?? null),
                  start: () => {
                    setMenuOpen(false)
                    void recorder.start()
                  },
                  stop: () => {
                    sendWhenWritten.current = false
                    recorder.stop()
                  },
                  stopAndSend: () => {
                    sendWhenWritten.current = true
                    recorder.stop()
                  },
                  cancel: () => {
                    sendWhenWritten.current = false
                    recorder.cancel()
                  },
                  dismiss: recorder.dismiss,
                }
              : undefined
          }
        >
          {receipts.items.length ? (
            <View className="gap-1.5 px-0.5 pt-0.5">
              <View className="flex-row flex-wrap gap-2">
                {receipts.items.map((item) => (
                  <ReceiptThumb
                    key={item.localId}
                    item={item}
                    onRemove={() => receipts.discard(item.localId)}
                  />
                ))}
              </View>
              {receipts.items.map((item) =>
                item.phase === "failed" ? (
                  <Text
                    key={item.localId}
                    className="text-base [-rn-line-height:22] text-destructive"
                  >
                    {item.fileName}: {item.error ?? "failed"}
                  </Text>
                ) : null,
              )}
            </View>
          ) : null}
        </AssistantComposer>
      </View>
      {menuOpen ? (
        <>
          <Pressable
            accessibilityLabel="Close attach menu"
            noRipple
            onPress={() => setMenuOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <AttachMenu
            bottom={boxHeight + 4}
            full={!receipts.canAdd}
            photos={canPhoto}
            onPick={pick}
          />
        </>
      ) : null}
    </>
  )
}

/** A photo or PDF in the box: a large rounded tile with a round × (owner's reference). */
function ReceiptThumb({
  item,
  onRemove,
}: {
  item: AssistantReceipt
  onRemove: () => void
}) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const large = useLargeTextLayout()
  const size = large ? 112 : 88
  const busy = item.phase === "uploading" || item.phase === "reading"
  return (
    <View
      accessible
      accessibilityLabel={`${item.fileName}, ${item.phase === "ready" ? "ready" : item.phase === "failed" ? "failed" : item.phase === "reading" ? "reading" : "uploading"}`}
      style={{
        backgroundColor: colors.muted,
        borderColor:
          item.phase === "failed" ? colors.destructive : "transparent",
        borderRadius: 18,
        borderWidth: 2,
        height: size,
        overflow: "hidden",
        width: size,
      }}
    >
      {item.image ? (
        <Image
          contentFit="cover"
          source={{ uri: item.uri }}
          style={{ height: "100%", width: "100%" }}
        />
      ) : (
        <View className="flex-1 justify-end gap-1 p-2">
          <Icon className="size-[24px] text-muted-foreground" name="FileText" />
          <Text
            className="text-xs font-bold [-rn-line-height:16] text-foreground"
            numberOfLines={2}
          >
            {item.fileName}
          </Text>
        </View>
      )}
      {busy ? (
        <View
          className="absolute inset-0 items-center justify-center"
          style={{ backgroundColor: palette.scrim }}
        >
          <ActivityIndicator color={palette.overlayForeground} />
        </View>
      ) : null}
      <Pressable
        accessibilityLabel={`Remove ${item.fileName}`}
        accessibilityRole="button"
        haptic
        hitSlop={8}
        onPress={onRemove}
        style={{
          alignItems: "center",
          backgroundColor: palette.paper,
          borderRadius: 14,
          height: 28,
          justifyContent: "center",
          position: "absolute",
          right: 5,
          top: 5,
          width: 28,
        }}
      >
        <Icon className="size-[15px]" color={palette.paperInk} name="X" />
      </Pressable>
    </View>
  )
}

/**
 * The + menu (owner's reference): a card floating above the box, keyboard
 * left open behind it. Camera · Upload photo · Upload file.
 */
function AttachMenu({
  bottom,
  full,
  photos,
  onPick,
}: {
  bottom: number
  full: boolean
  photos: boolean
  onPick: (source: "camera" | "library" | "file") => void
}) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const options: Array<{
    icon: IconKeys
    label: string
    source: "camera" | "library" | "file"
  }> = [
    ...(photos
      ? [
          {
            icon: "Camera" as const,
            label: "Camera",
            source: "camera" as const,
          },
          {
            icon: "Image" as const,
            label: "Upload photo",
            source: "library" as const,
          },
        ]
      : []),
    { icon: "FileText", label: "Upload file", source: "file" },
  ]
  return (
    <View
      accessibilityViewIsModal
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 20,
        borderWidth: 1,
        bottom,
        elevation: 8,
        left: 12,
        minWidth: 224,
        overflow: "hidden",
        paddingVertical: 6,
        position: "absolute",
        shadowColor: palette.cardShadow,
        shadowOffset: { height: 6, width: 0 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      }}
    >
      {options.map((option) => (
        <Pressable
          key={option.source}
          accessibilityRole="button"
          accessibilityState={{ disabled: full }}
          className={cn(
            "min-h-[52px] flex-row items-center gap-3.5 px-4",
            full && "opacity-45",
          )}
          disabled={full}
          haptic
          onPress={() => onPick(option.source)}
        >
          <Icon
            className="size-[22px]"
            color={colors.foreground}
            name={option.icon}
          />
          <Text className="text-base font-semibold [-rn-line-height:22] text-foreground">
            {option.label}
          </Text>
        </Pressable>
      ))}
      {full ? (
        <Text className="px-4 pb-2 pt-1 text-sm [-rn-line-height:20] text-muted-foreground">
          {ASSISTANT_ATTACHMENT_COPY.full}
        </Text>
      ) : null}
    </View>
  )
}
