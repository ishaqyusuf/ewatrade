import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { TextInput } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function CustomerConversationComposer({
  disabled,
  draft,
  hasActiveRequest,
  onChangeDraft,
  onSend,
  onToggleRequestIntent,
  sending,
  startingNewRequest,
}: {
  disabled: boolean
  draft: string
  hasActiveRequest: boolean
  onChangeDraft: (value: string) => void
  onSend: () => void
  onToggleRequestIntent: () => void
  sending: boolean
  startingNewRequest: boolean
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const canSend = !disabled && !sending && Boolean(draft.trim())

  return (
    <KeyboardStickyView
      offset={{ closed: 0, opened: 0 }}
      style={{ bottom: 0, left: 0, position: "absolute", right: 0, zIndex: 30 }}
    >
      <View
        className="gap-2 border-t border-border bg-background px-3 pt-2"
        style={{ paddingBottom: Math.max(insets.bottom, 10) }}
      >
        {hasActiveRequest ? (
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
        <View className="flex-row items-end gap-2 rounded-[24px] border border-border bg-card p-2">
          <Pressable
            accessibilityLabel="Attachments will be available soon"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full"
            disabled
          >
            <Icon className="size-sm text-muted-foreground" name="Plus" />
          </Pressable>
          <TextInput
            accessibilityLabel="Message the Store"
            className="max-h-32 min-h-11 min-w-0 flex-1 px-1 py-2.5 text-base text-foreground"
            editable={!disabled && !sending}
            maxLength={2_000}
            multiline
            onChangeText={onChangeDraft}
            placeholder={
              disabled ? "Messaging is unavailable" : "Message the Store"
            }
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.primary}
            value={draft}
          />
          <Pressable
            accessibilityLabel={sending ? "Sending message" : "Send message"}
            accessibilityRole="button"
            className={
              canSend
                ? "min-h-11 justify-center rounded-full bg-primary px-4"
                : "min-h-11 justify-center rounded-full bg-muted px-4"
            }
            disabled={!canSend}
            haptic
            onPress={onSend}
          >
            <Text
              className={
                canSend
                  ? "text-sm font-bold text-primary-foreground"
                  : "text-sm font-bold text-muted-foreground"
              }
            >
              {sending ? "Sending…" : "Send"}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardStickyView>
  )
}
