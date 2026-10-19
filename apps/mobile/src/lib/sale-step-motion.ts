// New sale's Items → Customer → Checkout steps share one route; they use the
// shared in-screen step motion (lib/step-motion, Workshop
// mobile/order-step-motion 01 v2).
import type { SaleStep } from "@/components/mobile/create-sale/create-sale-model"
import {
  STEP_MOTION,
  type StepDirection,
  stepDirection,
  stepEnterOffset,
} from "./step-motion"

export const SALE_STEPS: readonly SaleStep[] = ["items", "customer", "review"]

export type SaleStepDirection = StepDirection

export const SALE_STEP_MOTION = STEP_MOTION

export function saleStepIndex(step: SaleStep) {
  return SALE_STEPS.indexOf(step)
}

export function saleStepDirection(previous: SaleStep, next: SaleStep) {
  return stepDirection(SALE_STEPS, previous, next)
}

export const saleStepEnterOffset = stepEnterOffset

/**
 * What a navigation removal should do while New sale is open. Only a "back"
 * (system back, swipe or header back) is redirected to the previous step, and
 * only before the sale completes or while nothing is submitting; closing,
 * completion resets and any other navigation proceed.
 */
export function saleRemovalDecision(input: {
  step: SaleStep
  completed: boolean
  submitting: boolean
  actionType: string
}): "previous-step" | "proceed" {
  if (
    input.step === "items" ||
    input.completed ||
    input.submitting ||
    (input.actionType !== "GO_BACK" && input.actionType !== "POP")
  )
    return "proceed"
  return "previous-step"
}

/**
 * Where to put the Items list back when it remounts: the saved offset once
 * the content can actually scroll that far, otherwise not yet (null).
 */
export function itemsScrollRestore(
  saved: number,
  contentHeight: number,
  viewportHeight: number,
) {
  if (!(saved > 0)) return 0
  const reachable = contentHeight - viewportHeight
  return reachable >= saved ? saved : null
}

export function previousSaleStep(step: SaleStep): SaleStep {
  return step === "review" ? "customer" : "items"
}
