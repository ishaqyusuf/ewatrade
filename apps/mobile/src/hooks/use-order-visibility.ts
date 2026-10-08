import { useAuthContext } from "@/hooks/use-auth"
import {
  purgeOrderVisibilityCache,
  visibilityTightened,
} from "@/lib/order-visibility-cache"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { AppState } from "react-native"

export function useOrderVisibility() {
  const { profile } = useAuthContext()
  const trpc = useTRPC()
  const client = useQueryClient()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const storeId = profile?.storeId
  const canManage = ["OWNER", "ADMIN"].includes(profile?.role ?? "")
  const query = useQuery(
    trpc.stores.orderVisibility.queryOptions(
      { storeId },
      {
        enabled: Boolean(storeId) && !isOffline,
        staleTime: 0,
        refetchInterval: isOffline ? false : 30_000,
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
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && !isOffline) void query.refetch()
    })
    return () => subscription.remove()
  }, [isOffline, query.refetch])
  return null
}
