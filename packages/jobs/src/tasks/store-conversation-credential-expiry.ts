import { prisma } from "@ewatrade/db/client"
import {
  expireStoreConversationGuestCredential,
  listDueStoreConversationGuestCredentialExpiries,
} from "@ewatrade/db/queries"
import { logger, schedules } from "@trigger.dev/sdk/v3"

const SCHEDULE_LIMIT = 100

type CredentialIdentifier = { credentialId: string }

type Dependencies = {
  expire(input: CredentialIdentifier & { now: Date }): Promise<unknown>
  list(input: { limit: number; now: Date }): Promise<CredentialIdentifier[]>
}

function defaultDependencies(): Dependencies {
  return {
    expire: (input) => expireStoreConversationGuestCredential(prisma, input),
    list: (input) =>
      listDueStoreConversationGuestCredentialExpiries(prisma, input),
  }
}

export async function runStoreConversationCredentialExpiry(
  dependencies: Dependencies = defaultDependencies(),
  now = new Date(),
) {
  const credentials = await dependencies.list({
    limit: SCHEDULE_LIMIT,
    now,
  })
  const results = await Promise.allSettled(
    credentials.map((credential) =>
      dependencies.expire({ ...credential, now }),
    ),
  )
  const failed = results.filter((result) => result.status === "rejected").length
  return { expired: credentials.length - failed, failed }
}

export const storeConversationCredentialExpiry = schedules.task({
  cron: "0 * * * *",
  id: "store-conversation.credential-expiry",
  maxDuration: 120,
  run: async () => {
    const result = await runStoreConversationCredentialExpiry()
    logger.info("Expired due Store Conversation Guest credentials", result)
  },
})
