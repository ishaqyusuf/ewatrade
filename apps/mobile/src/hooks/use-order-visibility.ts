import { useAppActive } from "@/hooks/use-app-active"
import { useAuthContext } from "@/hooks/use-auth"
import {
  canReadBusinessInForeground,
  orderVisibilityPollInterval,
} from "@/lib/background-query-policy"
import {
  purgeOrderVisibilityCache,
  visibilityTightened,
} from "@/lib/order-visibility-cache"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

export function useOrderVisibility() {
  const { profile, isAuthenticated } = useAuthContext()
  const active = useAppActive()
  const trpc = useTRPC()
  const client = useQueryClient()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const storeId = profile?.storeId
  const canManage = ["OWNER", "ADMIN"].includes(profile?.role ?? "")
  const enabled =
    Boolean(storeId) &&
    canReadBusinessInForeground({
      active,
      authenticated: isAuthenticated,
      businessId: profile?.businessId,
      offline: isOffline,
    })
  const query = useQuery(
    trpc.stores.orderVisibility.queryOptions(
      { storeId },
      {
        enabled,
        staleTime: 0,
        refetchInterval: orderVisibilityPollInterval(enabled, canManage),
        refetchIntervalInBackground: false,
        refetchOnReconnect: "always",
        retry: false,
      },
    ),
  )
  const update = useMutation(
    trpc.stores.updateOrderVisibility.mutationOptions({
      onSuccess: async (data) => {
        client.setQueryData(
          trpc.stores.orderVisibility.queryKey({ storeId }),
          data,
        )
        await purgeOrderVisibilityCache(client)
        await client.invalidateQueries(
          trpc.stores.orderVisibility.queryFilter(),
        )
      },
    }),
  )
  return { query, update, storeId, canManage, isOffline }
}

/** Mounted once for foreground, reconnect, and periodic next-sync reconciliation. */
export function OrderVisibilityReconciler() {
  const { profile } = useAuthContext()
  const { query, isOffline } = useOrderVisibility()
  const client = useQueryClient()
  const previous = useRef<{ scope: string; visibility: string } | undefined>(
    undefined,
  )
  const scope = JSON.stringify([
    profile?.id,
    profile?.businessId,
    profile?.storeId,
  ])
  useEffect(() => {
    const current = query.data?.salesRepOrderVisibility
    if (!current || isOffline) return
    const last =
      previous.current?.scope === scope
        ? previous.current.visibility
        : undefined
    previous.current = { scope, visibility: current }
    if (visibilityTightened(last, current))
      void purgeOrderVisibilityCache(client)
  }, [client, isOffline, query.data?.salesRepOrderVisibility, scope])
  // useOrderVisibility re-enables its stale query on foreground, after scope
  // and offline checks. Direct refetch here would bypass those checks.
  return null
}
