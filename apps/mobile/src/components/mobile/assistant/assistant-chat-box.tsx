import { useCustomerVoiceNote } from "@/components/mobile/customer-conversations/use-customer-voice-note"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useTRPC } from "@/trpc/client"
import { formatStoreConversationVoiceElapsed } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { type ComponentProps, useEffect, useRef, useState } from "react"
import { AssistantComposer } from "./assistant-ui"
import { useAssistantReceipts } from "./use-assistant-receipts"

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
  mediaEnabled,
  resetKey,
  onReadyChange,
  ...composer
}: ComposerProps & {
  conversationId: string | null
  mediaEnabled: boolean
  /** Changes after a send so sent files leave the box. */
  resetKey: number
  onReadyChange: (files: AssistantReadyFile[]) => void
}) {
  const trpc = useTRPC()
  const [menuOpen, setMenuOpen] = useState(false)
  const capabilities = useQuery(
    trpc.setupAssistant.attachments.voiceCapabilities.queryOptions(undefined, {
      enabled: Boolean(conversationId),
      retry: false,
      staleTime: 30_000,
    }),
  )
  const valueRef = useRef(composer.value)
  valueRef.current = composer.value
  const onChangeRef = useRef(composer.onChange)
  onChangeRef.current = composer.onChange
  // "Stop and send": send once the written-out words reach the box.
  const sendWhenWritten = useRef(false)
  const [pendingSend, setPendingSend] = useState<string | null>(null)
  const receipts = useAssistantReceipts(conversationId ?? "", (text) => {
    const current = valueRef.current
    const next = current.trim() ? `${current.trimEnd()}\n${text}` : text
    onChangeRef.current(next)
    if (sendWhenWritten.current) {
      sendWhenWritten.current = false
      setPendingSend(next)
    }
  })
  const { onSend, value } = composer
  useEffect(() => {
    if (pendingSend === null || value !== pendingSend) return
    setPendingSend(null)
    onSend()
  }, [pendingSend, value, onSend])
  const recorder = useCustomerVoiceNote({
    enabled: capabilities.data?.enabled === true && Boolean(conversationId),
    scopeKey: conversationId ?? "none",
    onReady: (file) => {
      void receipts.addRecording(file)
      return true
    },
  })
  const { clear } = receipts
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the trigger.
  useEffect(() => {
    clear()
    setMenuOpen(false)
  }, [resetKey])
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

  const canAttach = Boolean(conversationId) && mediaEnabled
  const canTalk = Boolean(conversationId) && capabilities.data?.enabled === true
  const state = recorder.state
  const pick = (source: "camera" | "library" | "pdf") => {
    setMenuOpen(false)
    void receipts.pick(source)
  }
  return (
    <AssistantComposer
      {...composer}
      canSendEmpty={receipts.ready.length > 0}
      onAttach={canAttach ? () => setMenuOpen((open) => !open) : undefined}
      attachOpen={menuOpen}
      voice={
        canTalk
          ? {
              recording: state.kind === "recording",
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
      {menuOpen && receipts.canAdd ? (
        <View className="flex-row flex-wrap gap-2 px-1 pt-1">
          <MenuChip
            icon="Camera"
            label="Camera"
            onPress={() => pick("camera")}
          />
          <MenuChip
            icon="Image"
            label="Photos"
            onPress={() => pick("library")}
          />
          <MenuChip icon="FileText" label="PDF" onPress={() => pick("pdf")} />
        </View>
      ) : null}
      {receipts.items.length ? (
        <View className="flex-row flex-wrap gap-2 px-1 pt-1">
          {receipts.items.map((item) => (
            <View
              key={item.localId}
              className="max-w-full flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-1.5"
            >
              <Icon
                className="size-[13px] text-muted-foreground"
                name="ReceiptText"
              />
              <Text
                className="max-w-[150px] text-xs text-foreground"
                numberOfLines={1}
              >
                {item.fileName}
              </Text>
              <Text
                className={
                  item.phase === "failed"
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
                numberOfLines={1}
              >
                {item.phase === "ready"
                  ? "ready"
                  : item.phase === "failed"
                    ? (item.error ?? "failed")
                    : item.phase === "reading"
                      ? "reading…"
                      : "uploading…"}
              </Text>
              <Pressable
                accessibilityLabel={`Remove ${item.fileName}`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => receipts.discard(item.localId)}
              >
                <Icon className="size-[12px] text-muted-foreground" name="X" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </AssistantComposer>
  )
}

function MenuChip({
  icon,
  label,
  onPress,
}: {
  icon: IconKeys
  label: string
  onPress: () => void
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      haptic
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.muted,
        borderRadius: 999,
        flexDirection: "row",
        gap: 6,
        height: 34,
        paddingHorizontal: 12,
      }}
    >
      <Icon className="size-[15px]" color={colors.foreground} name={icon} />
      <Text className="text-xs font-bold text-foreground">{label}</Text>
    </Pressable>
  )
}
