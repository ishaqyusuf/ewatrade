import type { Prisma } from "../../generated/prisma/client"
import type { StaffInvitationNotificationIdentifier } from "./staff-invitation-notifications"
type Tx = Prisma.TransactionClient

export async function lockStaffInvitationNotification(
  tx: Tx,
  input: StaffInvitationNotificationIdentifier,
) {
  // Commands acquire this business lock first; preserve that ordering in workers.
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${input.tenantId} FOR SHARE`
  await tx.$queryRaw`SELECT n."id" FROM "StaffInvitationNotification" n
    JOIN "Membership" m ON m."id"=n."membershipId" AND m."tenantId"=n."tenantId"
    JOIN "RetailOpsStaffInviteToken" i ON i."id"=n."invitationId" AND i."tenantId"=n."tenantId"
    WHERE n."id"=${input.notificationId} AND n."tenantId"=${input.tenantId}
    FOR UPDATE OF n FOR SHARE OF m, i`
  return tx.staffInvitationNotification.findFirst({
    where: { id: input.notificationId, tenantId: input.tenantId },
    include: {
      command: { select: { actorUserId: true } },
      invitation: {
        select: {
          status: true,
          role: true,
          email: true,
          expiresAt: true,
          tokenHash: true,
          invitedUserId: true,
        },
      },
      membership: {
        select: {
          status: true,
          role: true,
          userId: true,
          staffAccessRevision: true,
          user: { select: { email: true } },
          retailOpsStaffProfile: { select: { defaultStoreId: true } },
          staffStoreAssignments: {
            where: {
              tenantId: input.tenantId,
              status: "ACTIVE",
              store: { tenantId: input.tenantId, status: "ACTIVE" },
            },
            select: { storeId: true },
          },
        },
      },
    },
  })
}
export type StaffInvitationNotificationRow = NonNullable<
  Awaited<ReturnType<typeof lockStaffInvitationNotification>>
>
