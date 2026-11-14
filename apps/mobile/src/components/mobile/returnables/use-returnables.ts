import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

/** Items the business set up as Returnable (crates, cylinders); offline keeps the last list read. */
export function useReturnableItems(enabled = true) {
  const trpc = useTRPC()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  return useQuery(
    trpc.returnables.items.queryOptions(undefined, {
      enabled: enabled && !isOffline,
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
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  return useQuery(
    trpc.returnables.balances.queryOptions(
      input.customerId ? { customerId: input.customerId } : {},
      { enabled: (input.enabled ?? true) && !isOffline, retry: false },
    ),
  )
}

export function useOrderReturnables(orderId: string, enabled = true) {
  const trpc = useTRPC()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  return useQuery(
    trpc.returnables.forOrder.queryOptions(
      { orderId },
      { enabled: enabled && !isOffline, retry: false },
    ),
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

export function returnableCount(quantity: number, itemName: string) {
  return `${quantity} ${itemName.toLowerCase()}${quantity === 1 || /s$/i.test(itemName) ? "" : "s"}`
}
