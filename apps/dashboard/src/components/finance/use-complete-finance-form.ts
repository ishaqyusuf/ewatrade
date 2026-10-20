"use client"
import { useFinanceInvalidation } from "@/hooks/use-finance-invalidation"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { toast } from "@ewatrade/ui"
import { useCallback } from "react"
/** Refreshes finance data, closes the sheet and says what was saved. */
export function useCompleteFinanceForm(message?: string) {
  const invalidate = useFinanceInvalidation()
  const { close } = useFinanceParams()
  return useCallback(async () => {
    await invalidate()
    await close()
    if (message) toast.success(message)
  }, [invalidate, close, message])
}
