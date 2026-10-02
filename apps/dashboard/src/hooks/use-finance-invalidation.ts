"use client"
import { useTRPC } from "@/trpc/client"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

export function useFinanceInvalidation() {
  const trpc = useTRPC()
  const client = useQueryClient()
  return useCallback(
    () => client.invalidateQueries({ queryKey: trpc.finance.pathKey() }),
    [client, trpc],
  )
}
