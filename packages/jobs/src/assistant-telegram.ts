import {
  TELEGRAM_DELIVERY_JOB_ID,
  TELEGRAM_DELIVERY_MAX_ATTEMPTS,
} from "@ewatrade/assistant/channels/delivery"
import {
  TELEGRAM_TURN_JOB_ID,
  TELEGRAM_TURN_MAX_ATTEMPTS,
} from "@ewatrade/assistant/channels/worker"
import {
  expireAssistantTelegramWork,
  listAssistantTelegramInboxRecovery,
  listAssistantTelegramOutboxRecovery,
} from "@ewatrade/db/assistant-telegram"
import { prisma } from "@ewatrade/db/client"
import {
  runAssistantTelegramDelivery,
  runAssistantTelegramTurn,
} from "./handlers/assistant-telegram"
import { triggerJob } from "./trigger"

export function enqueueAssistantTelegramTurn(ingressId: string) {
  return triggerJob(
    TELEGRAM_TURN_JOB_ID,
    (payload) =>
      runAssistantTelegramTurn(payload, enqueueAssistantTelegramTurn).then(
        () => undefined,
      ),
    { ingressId },
    { maxAttempts: TELEGRAM_TURN_MAX_ATTEMPTS, baseDelayMs: 2000 },
  )
}

export function enqueueAssistantTelegramDelivery(outboxId: string) {
  return triggerJob(
    TELEGRAM_DELIVERY_JOB_ID,
    (payload) =>
      runAssistantTelegramDelivery(
        payload,
        enqueueAssistantTelegramDelivery,
      ).then(() => undefined),
    { outboxId },
    { maxAttempts: TELEGRAM_DELIVERY_MAX_ATTEMPTS, baseDelayMs: 2000 },
  )
}

export async function recoverAssistantTelegramWork() {
  const expired = await expireAssistantTelegramWork(prisma)
  if (process.env.ASSISTANT_TELEGRAM_ENABLED !== "true")
    return { expired, queued: 0 }
  const [inbox, outbox] = await Promise.all([
    listAssistantTelegramInboxRecovery(prisma),
    listAssistantTelegramOutboxRecovery(prisma),
  ])
  const jobs = [
    ...inbox.map(({ id }) => enqueueAssistantTelegramTurn(id)),
    ...outbox.map(({ id }) => enqueueAssistantTelegramDelivery(id)),
  ]
  const outcomes = await Promise.allSettled(jobs)
  const queued = outcomes.filter(
    (result) => result.status === "fulfilled",
  ).length
  if (queued < jobs.length)
    console.error("[assistant] Telegram dispatch deferred to recovery")
  return { expired, queued }
}
