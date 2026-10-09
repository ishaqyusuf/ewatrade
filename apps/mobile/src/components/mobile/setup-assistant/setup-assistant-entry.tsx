import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { useAuthContext } from "@/hooks/use-auth"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { ActionButton } from "../action-button"
import { isAssistantSessionCurrent } from "../assistant/assistant-scope"
export function SetupAssistantEntry({
  describe = false,
  compact = false,
}: { describe?: boolean; compact?: boolean }) {
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
      router.push("/setup-assistant")
  }
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
