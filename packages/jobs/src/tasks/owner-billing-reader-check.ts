import { task } from "@trigger.dev/sdk/v3"
import { runOwnerBillingReaderCheck } from "../handlers/owner-billing-reader-check"

export const ownerBillingReaderCheck = task({
  id: "store-billing.verify-owner-plan-read",
  maxDuration: 60,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 1 },
  run: async (payload: unknown, { ctx }) => ({
    ...(await runOwnerBillingReaderCheck(payload)),
    runtime: {
      projectRef: ctx.project.ref,
      environment: ctx.environment.slug,
      version: ctx.run.version,
    },
  }),
})
