import type { PrismaClient } from "../../../generated/prisma/client"

/** Direct and indirect account attribution remains visible until deliberately erased. */
export async function assistantWhatsAppPrivacyInventory(
  db: Pick<PrismaClient, "$queryRaw">,
  subjectId: string,
) {
  const rows = await db.$queryRaw<
    {
      assistantWhatsAppIdentities: number
      assistantWhatsAppLinks: number
      assistantWhatsAppGrants: number
      assistantWhatsAppBindings: number
      assistantWhatsAppInbox: number
      assistantWhatsAppOutbox: number
      assistantWhatsAppAttempts: number
      assistantWhatsAppReceipts: number
      assistantWhatsAppUsageBuckets: number
      assistantWhatsAppSelections: number
      assistantWhatsAppActionReviews: number
      assistantWhatsAppWorkflowReviews: number
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM "AssistantWhatsAppIdentity" WHERE "userId"=${subjectId}) AS "assistantWhatsAppIdentities",
      (SELECT count(*)::int FROM "AssistantWhatsAppLink" WHERE "userId"=${subjectId}) AS "assistantWhatsAppLinks",
      (SELECT count(*)::int FROM "AssistantWhatsAppGrant" g JOIN "AssistantWhatsAppIdentity" i ON i.id=g."identityId" JOIN "Membership" m ON m.id=g."membershipId" AND m."tenantId"=g."tenantId" WHERE i."userId"=${subjectId} OR m."userId"=${subjectId}) AS "assistantWhatsAppGrants",
      (SELECT count(*)::int FROM "AssistantWhatsAppBinding" b JOIN "AssistantWhatsAppIdentity" i ON i.id=b."identityId" JOIN "AssistantConversation" c ON c.id=b."conversationId" WHERE i."userId"=${subjectId} OR c."ownerUserId"=${subjectId}) AS "assistantWhatsAppBindings",
      (SELECT count(*)::int FROM "AssistantWhatsAppInbox" q LEFT JOIN "AssistantWhatsAppBinding" b ON b.id=q."bindingId" LEFT JOIN "AssistantWhatsAppIdentity" i ON i.id=COALESCE(q."identityId",b."identityId") LEFT JOIN "AssistantConversation" c ON c.id=b."conversationId" WHERE i."userId"=${subjectId} OR c."ownerUserId"=${subjectId}) AS "assistantWhatsAppInbox",
      (SELECT count(*)::int FROM "AssistantWhatsAppOutbox" o JOIN "AssistantWhatsAppInbox" q ON q.id=o."inboxId" LEFT JOIN "AssistantWhatsAppBinding" b ON b.id=q."bindingId" LEFT JOIN "AssistantWhatsAppIdentity" i ON i.id=COALESCE(q."identityId",b."identityId") LEFT JOIN "AssistantConversation" c ON c.id=b."conversationId" WHERE i."userId"=${subjectId} OR c."ownerUserId"=${subjectId}) AS "assistantWhatsAppOutbox",
      (SELECT count(*)::int FROM "AssistantWhatsAppAttempt" a JOIN "AssistantWhatsAppOutbox" o ON o.id=a."outboxId" JOIN "AssistantWhatsAppInbox" q ON q.id=o."inboxId" LEFT JOIN "AssistantWhatsAppBinding" b ON b.id=q."bindingId" LEFT JOIN "AssistantWhatsAppIdentity" i ON i.id=COALESCE(q."identityId",b."identityId") LEFT JOIN "AssistantConversation" c ON c.id=b."conversationId" WHERE i."userId"=${subjectId} OR c."ownerUserId"=${subjectId}) AS "assistantWhatsAppAttempts",
      (SELECT count(*)::int FROM "AssistantWhatsAppReceipt" r JOIN "AssistantWhatsAppAttempt" a ON a.id=r."attemptId" JOIN "AssistantWhatsAppOutbox" o ON o.id=a."outboxId" JOIN "AssistantWhatsAppInbox" q ON q.id=o."inboxId" LEFT JOIN "AssistantWhatsAppBinding" b ON b.id=q."bindingId" LEFT JOIN "AssistantWhatsAppIdentity" i ON i.id=COALESCE(q."identityId",b."identityId") LEFT JOIN "AssistantConversation" c ON c.id=b."conversationId" WHERE i."userId"=${subjectId} OR c."ownerUserId"=${subjectId}) AS "assistantWhatsAppReceipts",
      (SELECT count(*)::int FROM "AssistantWhatsAppUsageBucket" WHERE "userId"=${subjectId}) AS "assistantWhatsAppUsageBuckets",
      (SELECT count(*)::int FROM "AssistantWhatsAppSelection" s JOIN "AssistantWhatsAppIdentity" i ON i.id=s."identityId" WHERE i."userId"=${subjectId}) AS "assistantWhatsAppSelections",
      (SELECT count(*)::int FROM "AssistantWhatsAppActionReview" r JOIN "AssistantWhatsAppBinding" b ON b.id=r."bindingId" JOIN "AssistantWhatsAppIdentity" i ON i.id=b."identityId" JOIN "AssistantActionProposal" p ON p.id=r."proposalId" WHERE i."userId"=${subjectId} OR p."actorUserId"=${subjectId}) AS "assistantWhatsAppActionReviews",
      (SELECT count(*)::int FROM "AssistantWhatsAppWorkflowReview" r JOIN "AssistantWhatsAppBinding" b ON b.id=r."bindingId" JOIN "AssistantWhatsAppIdentity" i ON i.id=b."identityId" JOIN "AssistantConversation" c ON c.id=r."conversationId" WHERE i."userId"=${subjectId} OR c."ownerUserId"=${subjectId}) AS "assistantWhatsAppWorkflowReviews"
  `
  const row = rows[0]
  if (
    !row ||
    [
      row.assistantWhatsAppIdentities,
      row.assistantWhatsAppLinks,
      row.assistantWhatsAppGrants,
      row.assistantWhatsAppBindings,
      row.assistantWhatsAppInbox,
      row.assistantWhatsAppOutbox,
      row.assistantWhatsAppAttempts,
      row.assistantWhatsAppReceipts,
      row.assistantWhatsAppUsageBuckets,
      row.assistantWhatsAppSelections,
      row.assistantWhatsAppActionReviews,
      row.assistantWhatsAppWorkflowReviews,
    ].some((value) => !Number.isSafeInteger(value) || value < 0)
  )
    throw new Error("Assistant WhatsApp privacy inventory unavailable.")
  return {
    assistantWhatsAppIdentities: row.assistantWhatsAppIdentities,
    assistantWhatsAppLinks: row.assistantWhatsAppLinks,
    assistantWhatsAppGrants: row.assistantWhatsAppGrants,
    assistantWhatsAppBindings: row.assistantWhatsAppBindings,
    assistantWhatsAppInbox: row.assistantWhatsAppInbox,
    assistantWhatsAppOutbox: row.assistantWhatsAppOutbox,
    assistantWhatsAppAttempts: row.assistantWhatsAppAttempts,
    assistantWhatsAppReceipts: row.assistantWhatsAppReceipts,
    assistantWhatsAppUsageBuckets: row.assistantWhatsAppUsageBuckets,
    assistantWhatsAppSelections: row.assistantWhatsAppSelections,
    assistantWhatsAppActionReviews: row.assistantWhatsAppActionReviews,
    assistantWhatsAppWorkflowReviews: row.assistantWhatsAppWorkflowReviews,
  }
}
