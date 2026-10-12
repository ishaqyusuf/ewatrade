import type { PrismaClient } from "../../generated/prisma/client"

export type AccountPrivacyStaffInvitationInventory = {
  staffInvitationCommands: number
  staffInvitationNotifications: number
  staffInvitationAttempts: number
  staffInvitationEncryptedPayloads: number
  staffInvitationQueuedNotifications: number
  staffInvitationUncertainNotifications: number
  staffInvitationProviderIdentifiers: number
}

/** Counts original actor/recipient attribution and verified-contact review candidates. */
export async function getAccountPrivacyStaffInvitationInventory(
  db: Pick<PrismaClient, "$queryRaw">,
  subjectId: string,
  verifiedContactEmail?: string | null,
): Promise<AccountPrivacyStaffInvitationInventory> {
  if (!subjectId.trim()) throw Error("Verified privacy subject required.")
  const email = verifiedContactEmail?.trim().toLowerCase() || null
  // One snapshot/round trip; OR scope counts a command only once, even for self-invites.
  const rows = await db.$queryRaw<AccountPrivacyStaffInvitationInventory[]>`
    WITH commands AS (
      SELECT c.id FROM "StaffInvitationCommand" c
      JOIN "Membership" m ON m.id=c."membershipId" AND m."tenantId"=c."tenantId"
      JOIN "RetailOpsStaffInviteToken" i ON i.id=c."invitationId" AND i."tenantId"=c."tenantId"
      WHERE c."actorUserId"=${subjectId} OR m."userId"=${subjectId} OR i."invitedUserId"=${subjectId}
        OR (${email}::text IS NOT NULL AND (
          (i."invitedUserId" IS NULL AND lower(i.email)=${email})
          OR lower(c.result->'details'->'recipient'->>'email')=${email}
        ))
    ), notifications AS (
      SELECT n.* FROM "StaffInvitationNotification" n JOIN commands c ON c.id=n."commandId"
    )
    SELECT
      (SELECT count(*)::int FROM commands) AS "staffInvitationCommands",
      count(*)::int AS "staffInvitationNotifications",
      (SELECT count(*)::int FROM "StaffInvitationNotificationAttempt" a JOIN notifications n ON n.id=a."notificationId" AND n."tenantId"=a."tenantId") AS "staffInvitationAttempts",
      count(*) FILTER (WHERE "payloadCiphertext" IS NOT NULL)::int AS "staffInvitationEncryptedPayloads",
      count(*) FILTER (WHERE status IN ('PENDING','CLAIMED','FAILED'))::int AS "staffInvitationQueuedNotifications",
      count(*) FILTER (WHERE status IN ('SENDING','OUTCOME_UNKNOWN'))::int AS "staffInvitationUncertainNotifications",
      count(*) FILTER (WHERE "providerKey" IS NOT NULL OR "providerMessageId" IS NOT NULL)::int AS "staffInvitationProviderIdentifiers"
    FROM notifications
  `
  const inventory = rows[0]
  if (
    !inventory ||
    [
      inventory.staffInvitationCommands,
      inventory.staffInvitationNotifications,
      inventory.staffInvitationAttempts,
      inventory.staffInvitationEncryptedPayloads,
      inventory.staffInvitationQueuedNotifications,
      inventory.staffInvitationUncertainNotifications,
      inventory.staffInvitationProviderIdentifiers,
    ].some((count) => !Number.isSafeInteger(count) || count < 0)
  )
    throw Error("Staff invitation privacy inventory unavailable.")
  return inventory
}
