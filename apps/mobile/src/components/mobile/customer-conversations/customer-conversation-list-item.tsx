import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { Text as NativeText } from "react-native"
import { RowDivider } from "../green-till/kit"
import { getCustomerConversationListItemPresentation } from "./customer-conversation-list-item-presentation"

const STORE_TINTS = ["mint", "lilac", "sky", "amber", "rose"] as const

/** A stable tint per store so each chat is easy to spot. */
function storeTint(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return STORE_TINTS[hash % STORE_TINTS.length]
}

type CustomerConversationListItemProps = {
  /** Row position inside the shared card. */
  first?: boolean
  last?: boolean
  lastActivityAt: Date | string
  lastMessage: { author: "customer" | "store" | "system"; text: string } | null
  onPress: () => void
  state: "active" | "archived" | "restricted"
  storeAvatar: { kind: "initials"; label: string }
  storeName: string
  unreadStoreMessages: number
}

export function CustomerConversationListItem({
  first = true,
  last = true,
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
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const tint = storeTint(storeName)
  const archived = state === "archived"
  const avatar = (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette[tint],
        borderRadius: 24,
        height: 48,
        justifyContent: "center",
        opacity: archived ? 0.6 : 1,
        width: 48,
      }}
    >
      <NativeText
        maxFontSizeMultiplier={1.3}
        style={{
          color: palette[`${tint}Foreground`],
          fontSize: 15,
          fontWeight: "800",
        }}
      >
        {storeAvatar.label}
      </NativeText>
    </View>
  )
  const shell = cn(
    "mx-[18px] overflow-hidden bg-card",
    first && "mt-1 rounded-t-[20px]",
    last && "rounded-b-[20px]",
  )

  if (largeTextLayout) {
    return (
      <View className={shell}>
        <Pressable
          accessibilityHint={presentation.accessibilityHint}
          accessibilityLabel={presentation.accessibilityLabel}
          accessibilityRole="button"
          className="min-h-[112px] flex-row items-start gap-3.5 px-4 py-4 active:opacity-80"
          haptic
          onPress={onPress}
        >
          {avatar}
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
                  className="mt-0.5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gold px-1.5 py-0.5"
                  importantForAccessibility="no-hide-descendants"
                >
                  <Text className="text-[11px] font-extrabold text-gold-foreground">
                    {presentation.unreadLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
        {last ? null : <RowDivider />}
      </View>
    )
  }

  return (
    <View className={shell}>
      <Pressable
        accessibilityHint={presentation.accessibilityHint}
        accessibilityLabel={presentation.accessibilityLabel}
        accessibilityRole="button"
        className="min-h-[76px] flex-row items-center gap-3.5 px-4 py-3.5 active:opacity-80"
        haptic
        onPress={onPress}
      >
        {avatar}
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center justify-between gap-3">
            <Text
              className={cn(
                "flex-1 font-bold",
                unread && "font-extrabold",
                archived ? "text-muted-foreground" : "text-foreground",
              )}
              numberOfLines={1}
            >
              {storeName}
            </Text>
            <Text
              className={cn(
                "text-xs font-semibold",
                unread ? "text-primary" : "text-muted-foreground",
              )}
            >
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
                className="min-w-5 items-center justify-center rounded-full bg-gold px-1.5 py-0.5"
                importantForAccessibility="no-hide-descendants"
              >
                <Text className="text-[11px] font-extrabold text-gold-foreground">
                  {presentation.unreadLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      {last ? null : <RowDivider />}
    </View>
  )
}
