import { schedules } from "@trigger.dev/sdk/v3"

import { prescriptionRetentionHandler } from "../handlers/prescription-retention"

export const prescriptionRetention = schedules.task({
  cron: "15 2 * * *",
  id: "prescriptions.retention",
  maxDuration: 900,
  run: async () => {
    await prescriptionRetentionHandler()
  },
})
