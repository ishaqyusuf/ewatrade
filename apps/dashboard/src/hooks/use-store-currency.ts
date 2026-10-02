"use client"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"

export function useStoreCurrency(storeId: string) {
  const trpc = useTRPC()
  const stores = useQuery(trpc.tenant.stores.queryOptions())
  return stores.data?.find((store) => store.id === storeId)?.currencyCode ?? ""
}
