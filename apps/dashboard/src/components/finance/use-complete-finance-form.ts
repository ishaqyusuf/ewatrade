"use client"
import { useFinanceInvalidation } from "@/hooks/use-finance-invalidation"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useCallback } from "react"
export function useCompleteFinanceForm() {
  const invalidate = useFinanceInvalidation()
  const { close } = useFinanceParams()
  return useCallback(async () => {
    await invalidate()
    await close()
  }, [invalidate, close])
}
