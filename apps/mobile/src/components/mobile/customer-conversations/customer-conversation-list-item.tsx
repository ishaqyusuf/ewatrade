import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { getCustomerConversationListItemPresentation } from "./customer-conversation-list-item-presentation"

type CustomerConversationListItemProps = {
  lastActivityAt: Date | string
  lastMessage: { author: "customer" | "store" | "system"; text: string } | null
  onPress: () => void
  state: "active" | "archived" | "restricted"
  storeAvatar: { kind: "initials"; label: string }
  storeName: string
  unreadStoreMessages: number
}

export function CustomerConversationListItem({
  lastActivityAt,
  lastMessage,
  onPress,
  state,
  storeAvatar,
  storeName,
  unreadStoreMessages,
}: CustomerConversationListItemProps) {
  const largeTextLayout = useLargeTextLayout()
  const presentation = getCustomerConversationListItemPresentation({
    lastActivityAt,
    lastMessage,
    state,
    storeName,
    unreadStoreMessages,
  })
  const unread = unreadStoreMessages > 0

  if (largeTextLayout) {
    return (
      <Pressable
        accessibilityHint={presentation.accessibilityHint}
        accessibilityLabel={presentation.accessibilityLabel}
        accessibilityRole="button"
        className={
          unread
            ? "relative min-h-[112px] flex-row items-start gap-3.5 border-b border-border bg-primary/5 px-5 py-4 active:bg-accent"
            : "relative min-h-[112px] flex-row items-start gap-3.5 border-b border-border px-5 py-4 active:bg-accent"
        }
        haptic
        onPress={onPress}
      >
        {unread ? (
          <View className="absolute bottom-4 left-0 top-4 w-1 rounded-r-full bg-primary" />
        ) : null}
        <View className="size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Text className="font-extrabold text-primary">
            {storeAvatar.label}
          </Text>
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text
            className={
              unread
                ? "font-extrabold text-foreground"
                : "font-bold text-foreground"
            }
            numberOfLines={2}
          >
            {storeName}
          </Text>
          <Text className="text-xs font-semibold text-muted-foreground">
            {presentation.activityLabel}
          </Text>
          <View className="flex-row items-start gap-2">
            {presentation.status ? (
              <View className="min-w-0 flex-1 flex-row items-start gap-1.5">
                <View
                  className={
                    presentation.status.tone === "destructive"
                      ? "mt-2 size-1.5 rounded-full bg-destructive"
                      : "mt-2 size-1.5 rounded-full bg-muted-foreground"
                  }
                />
                <Text
                  className={
                    presentation.status.tone === "destructive"
                      ? "min-w-0 flex-1 text-sm font-bold text-destructive"
                      : "min-w-0 flex-1 text-sm font-bold text-muted-foreground"
                  }
                  numberOfLines={2}
                >
                  {presentation.status.label}
                </Text>
              </View>
            ) : (
              <Text
                className="min-w-0 flex-1 text-sm text-muted-foreground"
                numberOfLines={2}
              >
                {presentation.preview?.authorLabel ? (
                  <Text className="font-bold text-muted-foreground">
                    {presentation.preview.authorLabel} · {""}
                  </Text>
                ) : null}
                {presentation.preview?.text}
              </Text>
            )}
            {presentation.unreadLabel ? (
              <View
                className="mt-0.5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 py-0.5"
                importantForAccessibility="no-hide-descendants"
              >
                <Text className="text-[11px] font-extrabold text-primary-foreground">
                  {presentation.unreadLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <Pressable
      accessibilityHint={presentation.accessibilityHint}
      accessibilityLabel={presentation.accessibilityLabel}
      accessibilityRole="button"
      className={
        unread
          ? "relative min-h-[82px] flex-row items-center gap-3.5 border-b border-border bg-primary/5 px-5 py-4 active:bg-accent"
          : "relative min-h-[82px] flex-row items-center gap-3.5 border-b border-border px-5 py-4 active:bg-accent"
      }
      haptic
      onPress={onPress}
    >
      {unread ? (
        <View className="absolute bottom-4 left-0 top-4 w-1 rounded-r-full bg-primary" />
      ) : null}
      <View className="size-12 items-center justify-center rounded-full bg-primary/10">
        <Text className="font-extrabold text-primary">{storeAvatar.label}</Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text
            className={
              unread
                ? "flex-1 font-extrabold text-foreground"
                : "flex-1 font-bold text-foreground"
            }
            numberOfLines={1}
          >
            {storeName}
          </Text>
          <Text className="text-xs font-semibold text-muted-foreground">
            {presentation.activityLabel}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {presentation.status ? (
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              <View
                className={
                  presentation.status.tone === "destructive"
                    ? "size-1.5 rounded-full bg-destructive"
                    : "size-1.5 rounded-full bg-muted-foreground"
                }
              />
              <Text
                className={
                  presentation.status.tone === "destructive"
                    ? "text-sm font-bold text-destructive"
                    : "text-sm font-bold text-muted-foreground"
                }
                numberOfLines={1}
              >
                {presentation.status.label}
              </Text>
            </View>
          ) : (
            <Text
              className="min-w-0 flex-1 text-sm text-muted-foreground"
              numberOfLines={1}
            >
              {presentation.preview?.authorLabel ? (
                <Text className="font-bold text-muted-foreground">
                  {presentation.preview.authorLabel} · {""}
                </Text>
              ) : null}
              {presentation.preview?.text}
            </Text>
          )}
          {presentation.unreadLabel ? (
            <View
              className="min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5"
              importantForAccessibility="no-hide-descendants"
            >
              <Text className="text-[11px] font-extrabold text-primary-foreground">
                {presentation.unreadLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}
