import { previousSaleStep, saleRemovalDecision } from "@/lib/sale-step-motion"
import { useNavigation, usePreventRemove } from "@react-navigation/native"
import { useEffect, useRef } from "react"
import { Alert } from "react-native"
import type { SaleStep } from "./create-sale-model"

type SaleBackModel = {
  step: SaleStep
  completion: unknown
  isSubmitting: boolean
  hasSaleLines: boolean
  setStep: (step: SaleStep) => void
  setError: (error: string | null) => void
}

/**
 * System back and swipe follow New sale's steps like the visible back:
 * Checkout → Customer → Items. On Items with lines added, back asks before
 * discarding them. Only a "back" is held; closing, the
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
      hasLines: latest.current.hasSaleLines,
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
      hasLines: model.hasSaleLines,
      actionType: "GO_BACK",
    }) !== "proceed",
    ({ data }) => {
      if (!mounted.current) return
      const decision = decide(data.action.type)
      if (decision === "previous-step") stepBack()
      else if (decision === "confirm-discard")
        Alert.alert(
          "Discard this sale?",
          "The items you added will be removed.",
          [
            { style: "cancel", text: "Keep editing" },
            {
              onPress: () => {
                if (mounted.current) navigation.dispatch(data.action)
              },
              style: "destructive",
              text: "Discard",
            },
          ],
        )
      else navigation.dispatch(data.action)
    },
  )
  return stepBack
}
