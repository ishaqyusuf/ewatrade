import { prisma } from "@ewatrade/db/client"
import { purgeExpiredAccountPrivacyVerification } from "@ewatrade/db/queries"
import { logger, task } from "@trigger.dev/sdk/v3"

export const accountPrivacyVerificationExpiry = task({
  id: "account-privacy.verification-expiry",
  run: async () => {
    const result = await purgeExpiredAccountPrivacyVerification(prisma)
    logger.info("Expired account privacy verification records removed", result)
    return result
  },
})
