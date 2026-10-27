import { task } from "@trigger.dev/sdk/v3"
import { manualPaymentAlertDispatchHandler } from "../manual-payment-alerts"

export const manualPaymentAlertDispatch = task({
  id: "manual-payment.alert-dispatch",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 5 },
  run: manualPaymentAlertDispatchHandler,
})
