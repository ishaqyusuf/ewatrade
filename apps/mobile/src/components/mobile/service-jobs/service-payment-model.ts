import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import type { WorkJob } from "./service-jobs-model"

export type ServicePaymentFields = {
  amount: string
  method: RouterInputs["orders"]["recordPayment"]["method"]
  reference: string
  /** Where money received now lands; unset when Finance isn't set up. */
  moneyAccountId?: string
  moneyAccountName?: string
  /** Hand-over only: the customer collected it, or it was delivered. */
  handoverMethod?: "collected" | "delivered"
}
export type ServicePaymentKind = "payment" | "handoff"
export type ServicePaymentDraft = ServicePaymentFields & {
  kind: ServicePaymentKind
  job: WorkJob
}

function exactPaymentMinor(value: string): number | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value)
  if (!match?.[1]) return null
  const minor =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"))
  return minor <= 100_000_000n ? Number(minor) : null
}

// The form and the final command boundary use the same validation.
export function projectServicePayment(
  job: Pick<WorkJob, "summary" | "handedOffAt" | "balanceDueMinor">,
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
    ((job.summary !== "ready_for_handoff" && job.summary !== "completed") ||
      job.handedOffAt)
  )
    return {
      amountMinor: null,
      error: job.handedOffAt
        ? "This job was already handed over."
        : "All active work must be ready before hand-over.",
    }
  const amount = fields.amount.trim()
  const amountMinor = amount
    ? exactPaymentMinor(amount)
    : kind === "handoff"
      ? 0
      : null
  if (
    amountMinor === null ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    amountMinor > 100_000_000
  )
    return { amountMinor: null, error: "Enter a supported payment amount." }
  if (
    kind === "payment" &&
    (amountMinor === 0 || amountMinor > job.balanceDueMinor)
  )
    return {
      amountMinor: null,
      error: "Enter a payment within the outstanding balance.",
    }
  // Hand-over may leave a balance owing; the review says how much.
  if (kind === "handoff" && amountMinor > job.balanceDueMinor)
    return {
      amountMinor: null,
      error: "Enter no more than the outstanding balance.",
    }
  return { amountMinor, error: null }
}

/** What stays owing after a hand-over collects `amountMinor`. */
export function serviceHandoffOwedMinor(
  job: Pick<WorkJob, "balanceDueMinor">,
  amountMinor: number,
) {
  return Math.max(0, job.balanceDueMinor - amountMinor)
}
