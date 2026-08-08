import { task } from "@trigger.dev/sdk/v3"

import {
  type PrescriptionMediaSafetyPayload,
  prescriptionMediaSafetyHandler,
} from "../handlers/prescription-media-safety"

export const prescriptionMediaSafety = task({
  id: "prescriptions.media-safety",
  maxDuration: 300,
  queue: { concurrencyLimit: 10 },
  run: async (input: PrescriptionMediaSafetyPayload) => {
    await prescriptionMediaSafetyHandler(input)
  },
})
