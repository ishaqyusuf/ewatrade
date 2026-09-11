import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { ExternalLink, MessageCircle } from "lucide-react-native"

import { resolveCustomerConversationChannelModeState } from "./customer-conversation-channel-mode-state"

type ChannelMode =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["channelMode"]

export function CustomerConversationChannelMode({
  channelMode,
  onOpen,
  opening,
}: {
  channelMode: ChannelMode
  onOpen: () => void
  opening: boolean
}) {
  const presentation = resolveCustomerConversationChannelModeState({
    opening,
    whatsappAction: channelMode.whatsappAction,
  })
  if (!presentation) return null

  return (
    <View className="border-y border-border py-3">
      <View className="flex-row items-start gap-2.5">
        <View className="size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon as={MessageCircle} className="size-sm text-primary" />
        </View>
        <View className="min-w-0 flex-1">
          <View className="mb-1 self-start rounded-full bg-primary/10 px-2 py-1">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-primary">
              {presentation.badge}
            </Text>
          </View>
          <Text className="text-base font-bold text-foreground">
            {presentation.title}
          </Text>
          <Text className="mt-1 text-xs leading-4 text-muted-foreground">
            {presentation.detail}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityHint={presentation.accessibilityHint}
        accessibilityRole="link"
        accessibilityState={{ disabled: opening }}
        className={
          opening
            ? "ml-12 mt-3 min-h-11 flex-row items-center justify-center gap-2 rounded-full border border-border bg-muted px-4 opacity-60"
            : presentation.primary
              ? "ml-12 mt-3 min-h-11 flex-row items-center justify-center gap-2 rounded-full bg-primary px-4"
              : "ml-12 mt-3 min-h-11 flex-row items-center justify-center gap-2 rounded-full border border-border bg-card px-4"
        }
        haptic
        disabled={opening}
        onPress={onOpen}
      >
        <Text
          className={
            opening
              ? "text-sm font-bold text-muted-foreground"
              : presentation.primary
                ? "text-sm font-bold text-primary-foreground"
                : "text-sm font-bold text-foreground"
          }
        >
          {presentation.label}
        </Text>
        <Icon
          as={ExternalLink}
          className={
            opening
              ? "size-sm text-muted-foreground"
              : presentation.primary
                ? "size-sm text-primary-foreground"
                : "size-sm text-muted-foreground"
          }
        />
      </Pressable>
    </View>
  )
}
