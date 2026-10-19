import {
  WHATSAPP_TURN_JOB_ID,
  WHATSAPP_TURN_MAX_ATTEMPTS,
  type WhatsAppTurnJob,
} from "@ewatrade/assistant/channels/worker"
import { task } from "@trigger.dev/sdk/v3"
import { runAssistantWhatsAppTurn } from "../handlers/assistant-whatsapp-turn"

export const assistantWhatsAppTurn = task({
  id: WHATSAPP_TURN_JOB_ID,
  maxDuration: 180,
  queue: { name: "assistant-whatsapp-turn", concurrencyLimit: 4 },
  retry: { maxAttempts: WHATSAPP_TURN_MAX_ATTEMPTS },
  run: (payload: WhatsAppTurnJob) => runAssistantWhatsAppTurn(payload),
})
