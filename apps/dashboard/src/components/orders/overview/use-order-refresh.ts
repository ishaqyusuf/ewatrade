"use client"

import { invalidateChangedOrderEffects } from "@/components/orders/invalidate-changed-order-effects"
import { useTRPC } from "@/trpc/client"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback } from "react"

/**
 * After any order change: waits for the open order, its Activity and Change
 * menu to refetch, so the new entry shows as the dialog closes. Lists,
 * stock, money and customer reads refresh behind it.
 */
export function useOrderRefresh(orderId: string) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const router = useRouter()
  return useCallback(async () => {
    const order = { orderId }
    const refreshedOrderKeys = [
      trpc.orders.get.queryKey(order),
      trpc.orders.timeline.queryKey(order),
      trpc.orders.changeOptions.queryKey(order),
      trpc.orders.activity.list.queryKey(order),
      // These previews quote this Order's balances and statuses.
      trpc.customerMessages.preview.queryKey(order),
    ]
    await Promise.allSettled(
      refreshedOrderKeys.map((queryKey) =>
        client.invalidateQueries({ queryKey }),
      ),
    )
    // After, so the list does not ride in the same request batch.
    void invalidateChangedOrderEffects(client, trpc, refreshedOrderKeys).then(
      () => router.refresh(),
    )
  }, [client, orderId, router, trpc])
}
