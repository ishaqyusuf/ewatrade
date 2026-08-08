import { task } from "@trigger.dev/sdk/v3"

import {
  type WhatsAppConnectionTestPayload,
  whatsappConnectionTestHandler,
} from "../handlers/whatsapp-connection-test"

export const whatsappConnectionTest = task({
  id: "communications.whatsapp-connection-test",
  maxDuration: 300,
  queue: { concurrencyLimit: 5 },
  run: async (input: WhatsAppConnectionTestPayload) => {
    await whatsappConnectionTestHandler(input)
  },
})
