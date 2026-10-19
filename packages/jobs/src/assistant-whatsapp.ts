import {
  WHATSAPP_DELIVERY_JOB_ID,
  WHATSAPP_DELIVERY_MAX_ATTEMPTS,
} from "@ewatrade/assistant/channels/delivery"
import {
  WHATSAPP_TURN_JOB_ID,
  WHATSAPP_TURN_MAX_ATTEMPTS,
} from "@ewatrade/assistant/channels/worker"
import { listAssistantWhatsAppOutboxRecovery } from "@ewatrade/db/assistant-whatsapp"
import {
  expireAssistantWhatsAppGrants,
  expireAssistantWhatsAppInbox,
  expireAssistantWhatsAppOutbox,
  expireAssistantWhatsAppUsage,
  listAssistantWhatsAppInboxRecovery,
} from "@ewatrade/db/assistant-whatsapp"
import { prisma } from "@ewatrade/db/client"
import { assistantWhatsAppDeliveryHandler } from "./handlers/assistant-whatsapp-delivery"
import { assistantWhatsAppTurnHandler } from "./handlers/assistant-whatsapp-turn"
import { triggerJob } from "./trigger"

export function enqueueAssistantWhatsAppTurn(ingressId: string) {
  return triggerJob(
    WHATSAPP_TURN_JOB_ID,
    assistantWhatsAppTurnHandler,
    { ingressId },
    { maxAttempts: WHATSAPP_TURN_MAX_ATTEMPTS, baseDelayMs: 2000 },
  )
}
const defaults = () => ({
  enabled: () => process.env.ASSISTANT_WHATSAPP_ENABLED === "true",
  expire: async () => {
    const grants = await expireAssistantWhatsAppGrants(prisma)
    const inbox = await expireAssistantWhatsAppInbox(prisma)
    const outbox = await expireAssistantWhatsAppOutbox(prisma)
    const usage = await expireAssistantWhatsAppUsage(prisma)
    return {
      cleared: grants.cleared + inbox.cleared + outbox.cleared + usage.cleared,
    }
  },
  list: async () => listAssistantWhatsAppInboxRecovery(prisma),
  enqueue: enqueueAssistantWhatsAppTurn,
})
/** Existing shared cadence recovers lost enqueue/crashed leases; no new cron. */
export async function recoverAssistantWhatsAppTurns(deps = defaults()) {
  const { cleared } = await deps.expire()
  if (!deps.enabled()) return { cleared, attempted: 0, queued: 0 }
  const rows = await deps.list()
  let queued = 0
  for (const row of rows) {
    try {
      await deps.enqueue(row.id)
      queued++
    } catch {
      console.error("[assistant] inbox dispatch deferred to recovery")
    }
  }
  return { cleared, attempted: rows.length, queued }
}

export function enqueueAssistantWhatsAppDelivery(outboxId: string) {
  return triggerJob(
    WHATSAPP_DELIVERY_JOB_ID,
    assistantWhatsAppDeliveryHandler,
    { outboxId },
    { maxAttempts: WHATSAPP_DELIVERY_MAX_ATTEMPTS, baseDelayMs: 2000 },
  )
}
export async function recoverAssistantWhatsAppDeliveries(
  deps = {
    enabled: () => process.env.ASSISTANT_WHATSAPP_ENABLED === "true",
    list: async () => listAssistantWhatsAppOutboxRecovery(prisma),
    enqueue: enqueueAssistantWhatsAppDelivery,
  },
) {
  if (!deps.enabled()) return { attempted: 0, queued: 0 }
  const rows = await deps.list()
  let queued = 0
  for (const row of rows) {
    try {
      await deps.enqueue(row.id)
      queued++
    } catch {
      console.error("[assistant] reply dispatch deferred to recovery")
    }
  }
  return { attempted: rows.length, queued }
}
