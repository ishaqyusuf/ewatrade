import { useGrowthIntent } from "@/hooks/use-growth-intent"
import { useEffect } from "react"

/** Emits `plan_sheet_opened` once when Plan and billing opens. Renders nothing. */
export function PlanPageOpened() {
  const intent = useGrowthIntent()
  useEffect(() => {
    intent.sheetOpened("plan_billing", "plan_page")
  }, [intent])
  return null
}
