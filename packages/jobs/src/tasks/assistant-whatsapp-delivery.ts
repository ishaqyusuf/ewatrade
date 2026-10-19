import {
  WHATSAPP_DELIVERY_JOB_ID,
  WHATSAPP_DELIVERY_MAX_ATTEMPTS,
  type WhatsAppDeliveryJob,
} from "@ewatrade/assistant/channels/delivery"
import { task } from "@trigger.dev/sdk/v3"
import { runAssistantWhatsAppDelivery } from "../handlers/assistant-whatsapp-delivery"

export const assistantWhatsAppDelivery = task({
  id: WHATSAPP_DELIVERY_JOB_ID,
  maxDuration: 120,
  queue: { name: "assistant-whatsapp-delivery", concurrencyLimit: 4 },
  retry: { maxAttempts: WHATSAPP_DELIVERY_MAX_ATTEMPTS },
  run: (payload: WhatsAppDeliveryJob) => runAssistantWhatsAppDelivery(payload),
})
