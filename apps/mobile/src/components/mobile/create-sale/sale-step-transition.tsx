import { StepTransition } from "@/components/ui/step-transition"
import { SALE_STEPS } from "@/lib/sale-step-motion"
import type { ReactNode } from "react"
import type { SaleStep } from "./create-sale-model"

/**
 * New sale's Items → Customer → Checkout motion (Workshop
 * mobile/order-step-motion 01 v2): the shared keyed step transition. Sale
 * state lives in the model, so lines, customer and payment survive back and
 * forth; the leaving step can't submit while it fades.
 */
export function SaleStepTransition({
  step,
  children,
}: {
  step: SaleStep
  children: ReactNode
}) {
  return (
    <StepTransition order={SALE_STEPS} step={step}>
      {children}
    </StepTransition>
  )
}
