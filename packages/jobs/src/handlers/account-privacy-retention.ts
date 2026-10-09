import { prisma } from "@ewatrade/db/client"
import { runAccountPrivacyRetentionBatch } from "@ewatrade/db/queries"
import { logger } from "@trigger.dev/sdk/v3"

export async function accountPrivacyRetentionHandler() {
  const result = await runAccountPrivacyRetentionBatch(prisma)
  if (result.failed || result.reviewsDue)
    logger.warn("Deletion retention needs operator review", result)
  return result
}
