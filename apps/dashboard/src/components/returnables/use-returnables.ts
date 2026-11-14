"use client"

import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export const RETURNABLES_LATE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** Items the business set up as Returnable (crates, cylinders). */
export function useReturnableItems(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.returnables.items.queryOptions(undefined, {
      enabled,
      retry: false,
      staleTime: 60_000,
    }),
  )
}

/** What customers still hold; one customer when `customerId` is given. */
export function useReturnableBalances(input: {
  customerId?: string
  enabled?: boolean
}) {
  const trpc = useTRPC()
  return useQuery(
    trpc.returnables.balances.queryOptions(
      input.customerId ? { customerId: input.customerId } : {},
      { enabled: input.enabled ?? true, retry: false },
    ),
  )
}

export function useOrderReturnables(orderId: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.returnables.forOrder.queryOptions({ orderId }, { retry: false }),
  )
}

/** Records a movement and refreshes every returnables read. */
export function useRecordReturnable() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation(
    trpc.returnables.record.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.returnables.pathKey(),
        }),
    }),
  )
}

/** "1 plastic egg crate", "5 plastic egg crates". */
export function returnableCount(quantity: number, itemName: string) {
  return `${quantity} ${itemName.toLowerCase()}${quantity === 1 || /s$/i.test(itemName) ? "" : "s"}`
}

export function daysOut(oldestOutAt: string | Date | null, now = Date.now()) {
  if (!oldestOutAt) return 0
  const at =
    oldestOutAt instanceof Date
      ? oldestOutAt.getTime()
      : Date.parse(oldestOutAt)
  return Math.max(0, Math.floor((now - at) / DAY_MS))
}

export function daysOutLabel(days: number) {
  return days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`
}
