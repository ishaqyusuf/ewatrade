import { triggerJob } from "../trigger"
import type { ManualReceiptAssessmentPayload } from "./manual-payment-receipt-assessment"
import { manualPaymentReceiptAssessmentHandler } from "./manual-payment-receipt-runtime"

/** Admission is independent of queue configuration and remains disabled by default. */
export function manualReceiptProcessingEnabled(environment = process.env) {
  const configuredLimits = [
    "MANUAL_RECEIPT_MAX_DAILY_REQUESTS",
    "MANUAL_RECEIPT_MAX_DAILY_TOKENS",
    "MANUAL_RECEIPT_RESERVED_TOKENS",
    "MANUAL_RECEIPT_MAX_DAILY_IMAGES",
    "MANUAL_RECEIPT_OLDEST_DAYS",
    "MANUAL_RECEIPT_FUTURE_MINUTES",
  ].every((key) => /^[1-9]\d{0,7}$/.test(environment[key] ?? ""))
  return (
    configuredLimits &&
    Number(environment.MANUAL_RECEIPT_OLDEST_DAYS) <= 36500 &&
    Number(environment.MANUAL_RECEIPT_FUTURE_MINUTES) <= 1440 &&
    environment.MANUAL_RECEIPT_PROCESSING_ENABLED === "true" &&
    environment.MANUAL_RECEIPT_PROCESSOR_APPROVED === "true" &&
    environment.MANUAL_RECEIPT_WORKER_ADMITTED === "true" &&
    Boolean(environment.MANUAL_RECEIPT_OPENAI_API_KEY?.trim()) &&
    ["gpt-4.1-mini", "gpt-4.1"].includes(
      environment.MANUAL_RECEIPT_MODEL?.trim() ?? "",
    )
  )
}

export async function enqueueManualReceiptAssessment(
  input: ManualReceiptAssessmentPayload,
) {
  if (!manualReceiptProcessingEnabled()) return false
  await triggerJob(
    "manual-payment.receipt-assessment",
    async (payload: ManualReceiptAssessmentPayload) => {
      await manualPaymentReceiptAssessmentHandler(payload)
    },
    input,
    { maxAttempts: 1 },
  )
  return true
}
