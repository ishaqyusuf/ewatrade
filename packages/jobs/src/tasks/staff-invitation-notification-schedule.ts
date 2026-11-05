import { prisma } from "@ewatrade/db/client"
import { listDueStaffInvitationNotifications } from "@ewatrade/db/queries"
import { task } from "@trigger.dev/sdk/v3"
import { runStaffInvitationNotificationSchedule } from "../handlers/staff-invitation-notification-schedule"
import { sendStaffInvitationNotificationNow } from "../staff-invitation-send"

/**
 * Runs inside the cadence: retries and rows a request never sent go out here,
 * in this run, instead of one Trigger run each.
 */
export function runStaffInvitationNotificationSweep() {
  return runStaffInvitationNotificationSchedule(process.env, {
    listDue: (input) => listDueStaffInvitationNotifications(prisma, input),
    enqueue: ({ attempt: _attempt, ...identity }) =>
      sendStaffInvitationNotificationNow(identity),
  })
}

export const staffInvitationNotificationSchedule = task({
  id: "staff.invitation.notification-schedule",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: runStaffInvitationNotificationSweep,
})
