import { task } from "@trigger.dev/sdk/v3"
import { manualPaymentReceiptAssessmentHandler } from "../handlers/manual-payment-receipt-runtime"

export const manualPaymentReceiptAssessment = task({
  id: "manual-payment.receipt-assessment",
  maxDuration: 60,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 2 },
  run: manualPaymentReceiptAssessmentHandler,
})
