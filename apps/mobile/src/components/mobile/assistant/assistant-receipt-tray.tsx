import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useEffect, useRef } from "react"
import { useAssistantReceipts } from "./use-assistant-receipts"

export type AssistantReadyFile = { attachmentId: string; fileName: string }

/**
 * Attach a receipt photo or PDF above the assistant's chat box. Files upload
 * and are read before they can be sent; ready ones go with the next message.
 */
export function AssistantReceiptTray({
  conversationId,
  disabled,
  onReadyChange,
}: {
  conversationId: string
  disabled: boolean
  onReadyChange: (files: AssistantReadyFile[]) => void
}) {
  const receipts = useAssistantReceipts(conversationId)
  const report = useRef(onReadyChange)
  report.current = onReadyChange
  const readyKey = receipts.ready
    .map((file) => `${file.attachmentId}\u0000${file.fileName}`)
    .join("\u0001")
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
  const blocked = disabled || !receipts.canAdd
  return (
    <View className="gap-2">
      {receipts.items.length ? (
        <View className="flex-row flex-wrap gap-2">
          {receipts.items.map((item) => (
            <View
              key={item.localId}
              className="max-w-full flex-row items-center gap-1.5 rounded-full bg-card px-3 py-1.5"
            >
              <Icon
                className="size-[13px] text-muted-foreground"
                name="ReceiptText"
              />
              <Text
                className="max-w-[160px] text-xs text-foreground"
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
      <View className="flex-row gap-2">
        <TrayButton
          disabled={blocked}
          icon="Camera"
          label="Photo of receipt"
          onPress={() => void receipts.pick("camera")}
        />
        <TrayButton
          disabled={blocked}
          icon="Image"
          label="Choose photo"
          onPress={() => void receipts.pick("library")}
        />
        <TrayButton
          disabled={blocked}
          icon="FileText"
          label="Attach PDF"
          onPress={() => void receipts.pick("pdf")}
        />
      </View>
    </View>
  )
}

function TrayButton({
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
        backgroundColor: colors.card,
        borderRadius: 999,
        height: 32,
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
        width: 40,
      }}
    >
      <Icon
        className="size-[16px]"
        color={colors.mutedForeground}
        name={icon}
      />
    </Pressable>
  )
}
