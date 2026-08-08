import { task } from "@trigger.dev/sdk/v3"

import {
  type PrescriptionCommunicationDispatchPayload,
  prescriptionCommunicationDispatchHandler,
} from "../handlers/prescription-communication-dispatch"

export const prescriptionCommunicationDispatch = task({
  id: "prescriptions.communication-dispatch",
  maxDuration: 300,
  queue: { concurrencyLimit: 20 },
  run: async (input: PrescriptionCommunicationDispatchPayload) => {
    await prescriptionCommunicationDispatchHandler(input)
  },
})
