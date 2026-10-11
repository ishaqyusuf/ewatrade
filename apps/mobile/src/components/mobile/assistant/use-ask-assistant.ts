import { useAuthContext } from "@/hooks/use-auth"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { isAssistantSessionCurrent } from "./assistant-scope"

/**
 * Opens the assistant screen with a starter line the owner keeps typing after.
 * `enabled` follows the server's launch flag; `canOpen` is false offline.
 */
export function useAskAssistant() {
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
  return {
    enabled: availability.data?.enabled === true,
    canOpen: permitted,
    ask: (draft: string) => {
      if (
        isAssistantSessionCurrent(
          origin,
          getSession(),
          useOperationalModeStore.getState().isOfflineMode,
          false,
        )
      )
        router.push({ pathname: "/ask-assistant", params: { draft } })
    },
  }
}

/** The order number as the title shows it, then a new line to keep typing. */
export const orderAssistantDraft = (orderNumber: string) =>
  `For order ${orderNumber}:\n`
