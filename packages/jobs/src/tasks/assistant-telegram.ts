import {
  type AssistantChannelDeliveryJob,
  TELEGRAM_DELIVERY_JOB_ID,
  TELEGRAM_DELIVERY_MAX_ATTEMPTS,
} from "@ewatrade/assistant/channels/delivery"
import {
  type AssistantChannelTurnJob,
  TELEGRAM_TURN_JOB_ID,
  TELEGRAM_TURN_MAX_ATTEMPTS,
} from "@ewatrade/assistant/channels/worker"
import { task } from "@trigger.dev/sdk/v3"
import {
  enqueueAssistantTelegramDelivery,
  enqueueAssistantTelegramTurn,
} from "../assistant-telegram"
import {
  runAssistantTelegramDelivery,
  runAssistantTelegramTurn,
} from "../handlers/assistant-telegram"

export const assistantTelegramTurn = task({
  id: TELEGRAM_TURN_JOB_ID,
  maxDuration: 180,
  queue: { name: "assistant-telegram-turn", concurrencyLimit: 4 },
  retry: { maxAttempts: TELEGRAM_TURN_MAX_ATTEMPTS },
  run: (payload: AssistantChannelTurnJob) =>
    runAssistantTelegramTurn(payload, enqueueAssistantTelegramTurn),
})

export const assistantTelegramDelivery = task({
  id: TELEGRAM_DELIVERY_JOB_ID,
  maxDuration: 120,
  queue: { name: "assistant-telegram-delivery", concurrencyLimit: 4 },
  retry: { maxAttempts: TELEGRAM_DELIVERY_MAX_ATTEMPTS },
  run: (payload: AssistantChannelDeliveryJob) =>
    runAssistantTelegramDelivery(payload, enqueueAssistantTelegramDelivery),
})
