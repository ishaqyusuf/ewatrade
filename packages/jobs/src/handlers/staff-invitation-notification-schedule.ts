import type { StaffInvitationNotificationIdentifier } from "@ewatrade/db/queries"
import { staffInvitationDeliveryConfigured } from "./staff-invitation-email"

export type StaffInvitationScheduleDependencies = {
  listDue(input: { limit: number; now: Date }): Promise<
    Array<{ tenantId: string; id: string }>
  >
  enqueue(input: StaffInvitationNotificationIdentifier): Promise<unknown>
}

export async function runStaffInvitationNotificationSchedule(
  config: NodeJS.ProcessEnv,
  dependencies: StaffInvitationScheduleDependencies,
  now = new Date(),
) {
  if (!staffInvitationDeliveryConfigured(config))
    return { deliveryConfigured: false, notificationsQueued: 0 }
  const due = await dependencies.listDue({ limit: 100, now })
  const results = await Promise.allSettled(
    due.map(({ tenantId, id }) =>
      dependencies.enqueue({ tenantId, notificationId: id }),
    ),
  )
  const failed = results.filter((result) => result.status === "rejected").length
  if (failed)
    throw Error(`Could not queue ${failed} staff invitation notification(s).`)
  return { notificationsQueued: due.length }
}
