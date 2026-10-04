import { logger, schedules } from "@trigger.dev/sdk/v3"
import { runPlayRefundReviewAlert } from "../handlers/play-refund-review-alert"
import { automaticJobCron } from "../schedule-policy"

export const playRefundReviewAlert = schedules.task({
  cron: automaticJobCron("*/15 * * * *"),
  id: "store-billing.play-refund-review-alert",
  maxDuration: 120,
  run: async () => {
    const result = await runPlayRefundReviewAlert()
    logger.info("Checked Play refund-review operator queue", result)
    return result
  },
})
