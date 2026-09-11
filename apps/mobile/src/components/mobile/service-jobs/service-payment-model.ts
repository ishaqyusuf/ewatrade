import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { majorToMinor } from "@ewatrade/utils"
import type { WorkJob } from "./service-jobs-model"

export type ServicePaymentFields = {
  amount: string
  method: RouterInputs["orders"]["recordPayment"]["method"]
  reference: string
}
export type ServicePaymentKind = "payment" | "handoff"
export type ServicePaymentDraft = ServicePaymentFields & {
  kind: ServicePaymentKind
  job: WorkJob
}

// Both appearances and the final command boundary use the same validation.
export function projectServicePayment(
  job: WorkJob,
  kind: ServicePaymentKind,
  fields: ServicePaymentFields,
): { amountMinor: number; error: null } | { amountMinor: null; error: string } {
  if (fields.reference.trim().length > 160)
    return {
      amountMinor: null,
      error: "Keep the payment reference to 160 characters.",
    }
  if (
    kind === "handoff" &&
    (job.summary !== "ready_for_handoff" || job.handedOffAt)
  )
    return {
      amountMinor: null,
      error: "All active work must be ready before collection.",
    }
  const amountMinor = fields.amount.trim()
    ? majorToMinor(fields.amount)
    : kind === "handoff"
      ? 0
      : null
  if (amountMinor === null || amountMinor < 0 || amountMinor > 100_000_000)
    return { amountMinor: null, error: "Enter a supported payment amount." }
  if (
    kind === "payment" &&
    (amountMinor === 0 || amountMinor > job.balanceDueMinor)
  )
    return {
      amountMinor: null,
      error: "Enter a payment within the outstanding balance.",
    }
  if (kind === "handoff" && amountMinor !== job.balanceDueMinor)
    return {
      amountMinor: null,
      error: "Collect exactly the outstanding balance before handoff.",
    }
  return { amountMinor, error: null }
}
