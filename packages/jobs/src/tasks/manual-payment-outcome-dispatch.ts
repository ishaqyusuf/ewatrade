import { task } from "@trigger.dev/sdk/v3"
import { manualPaymentOutcomeDispatchHandler } from "../manual-payment-outcomes"

export const manualPaymentOutcomeDispatch = task({
  id: "manual-payment.outcome-dispatch",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 5 },
  run: manualPaymentOutcomeDispatchHandler,
})
