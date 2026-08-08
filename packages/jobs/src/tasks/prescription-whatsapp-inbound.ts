import { task } from "@trigger.dev/sdk/v3"

import {
  type PrescriptionWhatsAppInboundPayload,
  prescriptionWhatsAppInboundHandler,
} from "../handlers/prescription-whatsapp-inbound"

export const prescriptionWhatsAppInbound = task({
  id: "prescriptions.whatsapp-inbound",
  maxDuration: 300,
  queue: { concurrencyLimit: 20 },
  run: async (input: PrescriptionWhatsAppInboundPayload) => {
    await prescriptionWhatsAppInboundHandler(input)
  },
})
