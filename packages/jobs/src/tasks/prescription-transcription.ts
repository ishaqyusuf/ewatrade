import { task } from "@trigger.dev/sdk/v3"

import {
  type PrescriptionTranscriptionPayload,
  prescriptionTranscriptionHandler,
} from "../handlers/prescription-transcription"

export const prescriptionTranscription = task({
  id: "prescriptions.transcription",
  maxDuration: 300,
  queue: { concurrencyLimit: 10 },
  run: async (input: PrescriptionTranscriptionPayload) => {
    await prescriptionTranscriptionHandler(input, 1)
  },
})
