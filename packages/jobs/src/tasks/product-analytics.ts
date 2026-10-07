import { task } from "@trigger.dev/sdk/v3"
import {
  productAnalyticsDispatchHandler,
  productAnalyticsRecoveryHandler,
} from "../handlers/product-analytics"
export const productAnalyticsDispatch = task({
  id: "analytics.dashboard.dispatch",
  maxDuration: 30,
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 1 },
  run: productAnalyticsDispatchHandler,
})
export const productAnalyticsRecovery = task({
  id: "analytics.dashboard.recovery",
  maxDuration: 60,
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: productAnalyticsRecoveryHandler,
})
