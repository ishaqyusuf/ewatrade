import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { ActionButton } from "../action-button"
import { isAssistantSessionCurrent } from "../assistant/assistant-scope"
import type { SetupIntroKind } from "./setup-intro-messages"
export function SetupAssistantEntry({
  describe = false,
  compact = false,
  intro,
}: {
  describe?: boolean
  compact?: boolean
  /** From Add item: a card that opens the chat with a goods or service intro. */
  intro?: SetupIntroKind
}) {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [origin] = useState(() => getSession())
  const permitted = isAssistantSessionCurrent(origin, auth.session, offline)
  const state = useQuery(
    trpc.setupAssistant.state.queryOptions(undefined, {
      enabled: permitted,
      retry: false,
    }),
  )
  if (!permitted || state.isError || state.data?.enabled !== true) return null
  const open = () => {
    if (
      isAssistantSessionCurrent(
        origin,
        getSession(),
        useOperationalModeStore.getState().isOfflineMode,
      )
    )
      router.push(
        intro
          ? { pathname: "/setup-assistant", params: { intro } }
          : "/setup-assistant",
      )
  }
  if (intro)
    return (
      <Pressable
        accessibilityHint={`Describe the ${intro === "service" ? "service" : "item"} in a chat and the assistant sets it up.`}
        accessibilityLabel="Create with assistant"
        accessibilityRole="button"
        className="min-h-14 flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-2.5 shadow-sm"
        haptic
        onPress={open}
      >
        <View className="size-9 items-center justify-center rounded-full bg-gold">
          <Icon name="Sparkles" className="size-[18px] text-gold-foreground" />
        </View>
        <Text className="min-w-0 flex-1 text-base font-bold [-rn-line-height:22] text-foreground">
          Create with assistant
        </Text>
        <Icon
          name="ChevronRight"
          className="size-[18px] text-muted-foreground"
        />
      </Pressable>
    )
  if (compact)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Setup assistant"
        className="size-[44px] items-center justify-center rounded-full bg-gold"
        onPress={open}
      >
        <Icon name="Sparkles" className="size-[20px] text-gold-foreground" />
      </Pressable>
    )
  return (
    <ActionButton
      variant="outline"
      icon="Sparkles"
      onPress={() => {
        if (
          isAssistantSessionCurrent(
            origin,
            getSession(),
            useOperationalModeStore.getState().isOfflineMode,
          )
        )
          router.push("/setup-assistant")
      }}
    >
      {describe ? "Describe it instead" : "Set up with AI"}
    </ActionButton>
  )
}
