import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { isAssistantSessionCurrent } from "./assistant-scope"
/** Hidden until the server advertises both launch authorization and a ready runtime. */
export function AssistantEntry({ query }: { query?: string }) {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [origin] = useState(() => getSession())
  const permitted = isAssistantSessionCurrent(
    origin,
    auth.session,
    offline,
    false,
  )
  const availability = useQuery(
    trpc.assistant.availability.queryOptions(undefined, {
      enabled: permitted,
      retry: false,
    }),
  )
  if (!permitted || !availability.data?.enabled) return null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        query ? `Ask ẸwáTrade about ${query}` : "Ask ẸwáTrade"
      }
      className={
        query
          ? "min-h-[52px] flex-row items-center gap-3 rounded-[18px] bg-gold px-3 py-2"
          : "size-[44px] items-center justify-center rounded-full bg-gold"
      }
      onPress={() => {
        if (
          isAssistantSessionCurrent(
            origin,
            getSession(),
            useOperationalModeStore.getState().isOfflineMode,
            false,
          )
        )
          router.push({
            pathname: "/ask-assistant",
            params: { query: query?.slice(0, 160) },
          })
      }}
    >
      <Icon name="Sparkles" className="size-[20px] text-gold-foreground" />
      {query ? (
        <Text className="min-w-0 flex-1 text-sm font-bold text-gold-foreground">
          Ask ẸwáTrade about ‘{query}’
        </Text>
      ) : null}
    </Pressable>
  )
}
