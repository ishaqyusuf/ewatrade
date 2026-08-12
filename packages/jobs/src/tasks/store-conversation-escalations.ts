import { prisma } from "@ewatrade/db/client"
import { recordOverdueStoreConversationEscalations } from "@ewatrade/db/queries"
import { logger, schedules } from "@trigger.dev/sdk/v3"

type Dependencies = {
  record(input: { limit: number; now: Date }): Promise<{
    openedCount: number
    scannedCount: number
  }>
}

const defaultDependencies: Dependencies = {
  record: (input) => recordOverdueStoreConversationEscalations(prisma, input),
}

export async function runStoreConversationEscalations(
  dependencies: Dependencies = defaultDependencies,
  now = new Date(),
) {
  return dependencies.record({ limit: 200, now })
}

export const storeConversationEscalations = schedules.task({
  cron: "* * * * *",
  id: "store-conversations.escalations",
  maxDuration: 120,
  run: async () => {
    const result = await runStoreConversationEscalations()
    logger.info("Recorded bounded Store Conversation escalation facts", result)
    return result
  },
})
