import { prisma } from "@ewatrade/db/client"
import { listDueStoreConversationWhatsAppBridgePrompts } from "@ewatrade/db/queries"
import { logger, schedules } from "@trigger.dev/sdk/v3"

import { storeConversationWhatsAppBridgePrompt } from "./store-conversation-whatsapp-bridge-prompt"

const SCHEDULE_LIMIT = 100

type PromptIdentifier = {
  bridgeId: string
  storeId: string
  tenantId: string
}

type Dependencies = {
  enqueue(input: PromptIdentifier): Promise<unknown>
  list(input: { limit: number; now: Date }): Promise<PromptIdentifier[]>
}

function defaultDependencies(): Dependencies {
  return {
    enqueue: (input) => storeConversationWhatsAppBridgePrompt.trigger(input),
    list: (input) =>
      listDueStoreConversationWhatsAppBridgePrompts(prisma, input),
  }
}

export async function runStoreConversationWhatsAppBridgeSchedule(
  dependencies: Dependencies = defaultDependencies(),
  now = new Date(),
) {
  const prompts = await dependencies.list({ limit: SCHEDULE_LIMIT, now })
  const results = await Promise.allSettled(
    prompts.map((prompt) => dependencies.enqueue(prompt)),
  )
  const failed = results.filter((result) => result.status === "rejected").length
  return failed
    ? { failed, queued: prompts.length - failed }
    : { queued: prompts.length }
}

export const storeConversationWhatsAppBridgeSchedule = schedules.task({
  cron: "* * * * *",
  id: "store-conversation.whatsapp-bridge-schedule",
  maxDuration: 120,
  run: async () => {
    const result = await runStoreConversationWhatsAppBridgeSchedule()
    logger.info("Queued due Store Conversation WhatsApp bridge prompts", result)
  },
})
