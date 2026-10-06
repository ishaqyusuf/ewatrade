import { schedules } from "@trigger.dev/sdk/v3"
import { automaticJobCron } from "../schedule-policy"

import { prescriptionRetentionHandler } from "../handlers/prescription-retention"

export const prescriptionRetention = schedules.task({
  cron: automaticJobCron("15 2 * * *"),
  id: "prescriptions.retention",
  maxDuration: 900,
  run: async () => {
    await prescriptionRetentionHandler()
  },
})
