import type { PrismaClient } from "../../generated/prisma/client"

export type AccountPrivacyAdditionalInventoryClient = Pick<
  PrismaClient,
  | "assistantConversation"
  | "assistantRun"
  | "message"
  | "automationEvent"
  | "productAnalyticsEvent"
>

/** Unhandled direct attribution must not disappear behind an older domain ledger. */
export async function getAccountPrivacyAdditionalInventory(
  db: AccountPrivacyAdditionalInventoryClient,
  subjectId: string,
) {
  // Sequential for the bounded single-connection processing transaction.
  const assistantConversations = await db.assistantConversation.count({
    where: { ownerUserId: subjectId },
  })
  const assistantRuns = await db.assistantRun.count({
    where: { actorUserId: subjectId },
  })
  const legacyMessages = await db.message.count({
    where: { senderUserId: subjectId },
  })
  const automationEvents = await db.automationEvent.count({
    where: { actorUserId: subjectId },
  })
  const analyticsEvents = await db.productAnalyticsEvent.count({
    where: { userId: subjectId },
  })
  return {
    assistantConversations,
    assistantRuns,
    legacyMessages,
    automationEvents,
    analyticsEvents,
  }
}
