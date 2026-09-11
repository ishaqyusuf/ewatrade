import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

export function CustomerNotificationSummaryControls({
  available,
  busy,
  expanded,
  onNotifyWhenAvailable,
  onToggle,
}: {
  available: boolean
  busy: boolean
  expanded: boolean
  onNotifyWhenAvailable(): void
  onToggle(): void
}) {
  return (
    <View
      className={
        available
          ? "min-h-11 items-end"
          : "min-h-11 flex-row items-center justify-between gap-2"
      }
    >
      {!available ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3"
          disabled={busy}
          haptic
          onPress={onNotifyWhenAvailable}
        >
          <Icon className="size-sm text-primary" name="Bell" />
          <Text
            className="min-w-0 flex-1 text-center text-xs font-bold text-primary"
            numberOfLines={1}
          >
            Notify me when available
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityHint="Configure alerts for unread Store replies"
        accessibilityLabel="Response notifications"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="min-h-11 shrink-0 flex-row items-center gap-1.5 rounded-full px-2"
        onPress={onToggle}
      >
        <Icon className="size-xs text-muted-foreground" name="Bell" />
        <Text className="text-xs font-medium text-muted-foreground">
          Notifications
        </Text>
        <Icon
          className={
            expanded
              ? "size-xs rotate-180 text-muted-foreground"
              : "size-xs text-muted-foreground"
          }
          name="ChevronDown"
        />
      </Pressable>
    </View>
  )
}
