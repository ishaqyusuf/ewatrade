import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"

type CustomerConversationListItemProps = {
  lastActivityAt: Date | string
  lastMessage: { author: "customer" | "store" | "system"; text: string } | null
  onPress: () => void
  state: "active" | "archived" | "restricted"
  storeAvatar: { kind: "initials"; label: string }
  storeName: string
}

export function CustomerConversationListItem({
  lastActivityAt,
  lastMessage,
  onPress,
  state,
  storeAvatar,
  storeName,
}: CustomerConversationListItemProps) {
  const date = new Date(lastActivityAt)
  const status =
    state === "active"
      ? "Open conversation"
      : state === "archived"
        ? "Archived"
        : "Messaging restricted"

  return (
    <Pressable
      accessibilityHint={`${status}. Last activity ${date.toLocaleDateString()}`}
      accessibilityLabel={`Open conversation with ${storeName}`}
      accessibilityRole="button"
      className="min-h-20 flex-row items-center gap-4 border-b border-border px-5 py-4 active:bg-accent"
      haptic
      onPress={onPress}
    >
      <View className="size-12 items-center justify-center rounded-full bg-primary/10">
        <Text className="font-extrabold text-primary">{storeAvatar.label}</Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 font-bold text-foreground" numberOfLines={1}>
            {storeName}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {date.toLocaleDateString()}
          </Text>
        </View>
        <Text className="text-sm text-muted-foreground" numberOfLines={1}>
          {lastMessage
            ? `${lastMessage.author === "customer" ? "You" : lastMessage.author === "store" ? storeName : "EwaTrade"}: ${lastMessage.text}`
            : status}
        </Text>
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}
