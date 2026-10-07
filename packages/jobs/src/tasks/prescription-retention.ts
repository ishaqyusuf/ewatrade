import { task } from "@trigger.dev/sdk/v3"

import { prescriptionRetentionHandler } from "../handlers/prescription-retention"

export const prescriptionRetention = task({
  id: "prescriptions.retention",
  maxDuration: 900,
  run: async () => {
    await prescriptionRetentionHandler()
  },
})
