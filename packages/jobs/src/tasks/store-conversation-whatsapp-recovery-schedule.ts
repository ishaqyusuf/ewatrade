import { prisma } from "@ewatrade/db/client"
import { listDueStoreConversationWhatsAppRecoveries } from "@ewatrade/db/queries"
import { logger, schedules } from "@trigger.dev/sdk/v3"

import { storeConversationWhatsAppRecovery } from "./store-conversation-whatsapp-recovery"

const SCHEDULE_LIMIT = 100

type RecoveryIdentifier = {
  attemptId: string
  storeId: string
  tenantId: string
}

type Dependencies = {
  enqueue(input: RecoveryIdentifier): Promise<unknown>
  list(input: { limit: number; now: Date }): Promise<RecoveryIdentifier[]>
}

function defaultDependencies(): Dependencies {
  return {
    enqueue: (input) => storeConversationWhatsAppRecovery.trigger(input),
    list: (input) =>
      listDueStoreConversationWhatsAppRecoveries(prisma, input),
  }
}

export async function runStoreConversationWhatsAppRecoverySchedule(
  dependencies: Dependencies = defaultDependencies(),
  now = new Date(),
) {
  const recoveries = await dependencies.list({ limit: SCHEDULE_LIMIT, now })
  const results = await Promise.allSettled(
    recoveries.map((recovery) => dependencies.enqueue(recovery)),
  )
  const failed = results.filter((result) => result.status === "rejected").length
  return failed
    ? { failed, queued: recoveries.length - failed }
    : { queued: recoveries.length }
}

export const storeConversationWhatsAppRecoverySchedule = schedules.task({
  cron: "* * * * *",
  id: "store-conversation.whatsapp-recovery-schedule",
  maxDuration: 120,
  run: async () => {
    const result = await runStoreConversationWhatsAppRecoverySchedule()
    logger.info("Queued due Store Conversation WhatsApp recoveries", result)
  },
})
