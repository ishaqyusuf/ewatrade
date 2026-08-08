import { task } from "@trigger.dev/sdk/v3"

import {
  type PrescriptionPrivacyRequestPayload,
  prescriptionPrivacyRequestHandler,
} from "../handlers/prescription-privacy-request"

export const prescriptionPrivacyRequest = task({
  id: "prescriptions.privacy-request",
  maxDuration: 900,
  run: async (payload: PrescriptionPrivacyRequestPayload) => {
    await prescriptionPrivacyRequestHandler(payload)
  },
})
