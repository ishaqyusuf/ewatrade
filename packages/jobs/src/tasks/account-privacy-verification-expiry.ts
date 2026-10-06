import { prisma } from "@ewatrade/db/client"
import { purgeExpiredAccountPrivacyVerification } from "@ewatrade/db/queries"
import { logger, schedules } from "@trigger.dev/sdk/v3"
import { automaticJobCron } from "../schedule-policy"

export const accountPrivacyVerificationExpiry = schedules.task({
  id: "account-privacy.verification-expiry",
  cron: automaticJobCron("0 * * * *"),
  run: async () => {
    const result = await purgeExpiredAccountPrivacyVerification(prisma)
    logger.info("Expired account privacy verification records removed", result)
    return result
  },
})
