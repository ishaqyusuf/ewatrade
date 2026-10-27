import { task } from "@trigger.dev/sdk/v3"
import { manualPaymentPolicyChangeHandler } from "../manual-payment-alerts"

export const manualPaymentPolicyChange = task({
  id: "manual-payment.policy-change",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 1 },
  run: manualPaymentPolicyChangeHandler,
})
