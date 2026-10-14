"use client"

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
    await Promise.allSettled(
      [
        trpc.orders.get.queryKey(order),
        trpc.orders.timeline.queryKey(order),
        trpc.orders.changeOptions.queryKey(order),
        trpc.orders.activity.list.queryKey(order),
        // WhatsApp previews quote balances and statuses: never reuse one
        // read before this change.
        trpc.customerMessages.preview.queryKey(),
      ].map((queryKey) => client.invalidateQueries({ queryKey })),
    )
    // After, so the list does not ride in the same request batch.
    void Promise.allSettled([
      client.invalidateQueries({ queryKey: trpc.orders.listPage.pathKey() }),
      ...[
        trpc.orders.pathKey(),
        trpc.catalog.pathKey(),
        trpc.inventory.pathKey(),
        trpc.customers.pathKey(),
        trpc.customerLedger.pathKey(),
        trpc.finance.pathKey(),
        trpc.search.pathKey(),
      ].map((queryKey) =>
        client.invalidateQueries({ queryKey, refetchType: "none" }),
      ),
    ]).then(() => router.refresh())
  }, [client, orderId, router, trpc])
}
