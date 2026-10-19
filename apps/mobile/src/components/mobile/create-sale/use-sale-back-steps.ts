import { previousSaleStep, saleRemovalDecision } from "@/lib/sale-step-motion"
import { useNavigation, usePreventRemove } from "@react-navigation/native"
import { useEffect, useRef } from "react"
import type { SaleStep } from "./create-sale-model"

type SaleBackModel = {
  step: SaleStep
  completion: unknown
  isSubmitting: boolean
  setStep: (step: SaleStep) => void
  setError: (error: string | null) => void
}

/**
 * System back and swipe follow New sale's steps like the visible back:
 * Checkout → Customer → Items. Only a "back" is redirected; closing, the
 * completed sale's reset and any other navigation proceed. Every decision
 * reads the sale's latest state, so a retained callback can't step a sale
 * that has since completed, and nothing changes after unmount.
 */
export function useSaleBackSteps(model: SaleBackModel) {
  const navigation = useNavigation()
  const latest = useRef(model)
  latest.current = model
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const decide = (actionType: string) =>
    saleRemovalDecision({
      step: latest.current.step,
      completed: latest.current.completion !== null,
      submitting: latest.current.isSubmitting,
      actionType,
    })
  // Shared by the visible back and system back: always the latest state, so
  // a retained press can't step a finished, submitting or Items sale.
  const stepBack = () => {
    if (!mounted.current || decide("GO_BACK") !== "previous-step") return
    const current = latest.current
    current.setError(null)
    current.setStep(previousSaleStep(current.step))
  }
  usePreventRemove(
    saleRemovalDecision({
      step: model.step,
      completed: model.completion !== null,
      submitting: model.isSubmitting,
      actionType: "GO_BACK",
    }) === "previous-step",
    ({ data }) => {
      if (!mounted.current) return
      if (decide(data.action.type) === "previous-step") stepBack()
      else navigation.dispatch(data.action)
    },
  )
  return stepBack
}
