import { prisma } from "@ewatrade/db/client"
import { listDueStaffInvitationNotifications } from "@ewatrade/db/queries"
import { task } from "@trigger.dev/sdk/v3"
import { runStaffInvitationNotificationSchedule } from "../handlers/staff-invitation-notification-schedule"
import { staffInvitationDispatchOptions } from "../staff-invitation-dispatch"
import { staffInvitationNotificationDispatch } from "./staff-invitation-notification-dispatch"

/** Safety net only: invitation events and self-scheduled retries dispatch first. */
export function runStaffInvitationNotificationSweep() {
  return runStaffInvitationNotificationSchedule(process.env, {
    listDue: (input) => listDueStaffInvitationNotifications(prisma, input),
    enqueue: async ({ attempt, ...identity }) =>
      staffInvitationNotificationDispatch.trigger(
        identity,
        await staffInvitationDispatchOptions({ ...identity, attempt }),
      ),
  })
}

export const staffInvitationNotificationSchedule = task({
  id: "staff.invitation.notification-schedule",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: runStaffInvitationNotificationSweep,
})
