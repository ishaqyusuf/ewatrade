import { prisma } from "@ewatrade/db/client"
import {
  claimBusinessNotificationFanout,
  fanoutBusinessNotifications,
  releaseFailedBusinessNotificationFanout,
} from "@ewatrade/db/queries"

/**
 * Source-only in-app sweep. No provider calls and no schedule registration until
 * canonical producer/privacy/concurrency acceptance releases the type list.
 */
export async function runBusinessActivityFanout() {
  if (
    !["local", "dev"].includes(process.env.APP_ENV ?? "") ||
    process.env.NODE_ENV !== "development"
  )
    return { claimed: 0, completed: 0, failed: 0, created: 0 }
  const claims = await claimBusinessNotificationFanout(prisma, {
    limit: 5,
    leaseSeconds: 300,
  })
  const result = { claimed: claims.length, completed: 0, failed: 0, created: 0 }
  for (const claim of claims) {
    try {
      const page = await fanoutBusinessNotifications(prisma, claim)
      result.created += page.created
      if (!page.more) result.completed++
    } catch {
      await releaseFailedBusinessNotificationFanout(prisma, claim)
      result.failed++
    }
  }
  return result
}
