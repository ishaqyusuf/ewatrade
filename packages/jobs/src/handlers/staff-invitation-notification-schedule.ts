import type { StaffInvitationNotificationIdentifier } from "@ewatrade/db/queries"
import { STAFF_INVITATION_SWEEP_OVERDUE_MS } from "../staff-invitation-dispatch"
import { staffInvitationDeliveryConfigured } from "./staff-invitation-email"

export type StaffInvitationScheduleDependencies = {
  listDue(input: { limit: number; now: Date; overdueMs: number }): Promise<
    Array<{ tenantId: string; id: string; attemptCount: number }>
  >
  enqueue(
    input: StaffInvitationNotificationIdentifier & { attempt: number },
  ): Promise<unknown>
}

export async function runStaffInvitationNotificationSchedule(
  config: NodeJS.ProcessEnv,
  dependencies: StaffInvitationScheduleDependencies,
  now = new Date(),
) {
  if (!staffInvitationDeliveryConfigured(config))
    return { deliveryConfigured: false, notificationsQueued: 0 }
  const due = await dependencies.listDue({
    limit: 100,
    now,
    overdueMs: STAFF_INVITATION_SWEEP_OVERDUE_MS,
  })
  // The attempt-scoped key dedupes against an event or retry run still pending.
  const results = await Promise.allSettled(
    due.map(({ tenantId, id, attemptCount }) =>
      dependencies.enqueue({
        tenantId,
        notificationId: id,
        attempt: attemptCount + 1,
      }),
    ),
  )
  const failed = results.filter((result) => result.status === "rejected").length
  if (failed)
    throw Error(`Could not queue ${failed} staff invitation notification(s).`)
  return { notificationsQueued: due.length }
}
