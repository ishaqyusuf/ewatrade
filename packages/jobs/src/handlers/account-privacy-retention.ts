import { prisma } from "@ewatrade/db/client"
import {
  runAccountPrivacyRecordRetentionBatch,
  runAccountPrivacyRetentionBatch,
} from "@ewatrade/db/queries"
import { logger } from "@trigger.dev/sdk/v3"

export async function accountPrivacyRetentionHandler() {
  const result = await runAccountPrivacyRetentionBatch(prisma)
  if (result.failed || result.reviewsDue)
    logger.warn("Deletion retention needs operator review", result)
  const records = await runAccountPrivacyRecordRetentionBatch(prisma)
  if (records.failed || records.reviewsDue)
    logger.warn("Retained records need controller review", records)
  return { ...result, records }
}
