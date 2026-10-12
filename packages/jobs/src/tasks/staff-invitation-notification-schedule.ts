import { prisma } from "@ewatrade/db/client"
import { listDueStaffInvitationNotifications } from "@ewatrade/db/queries"
import { task } from "@trigger.dev/sdk/v3"
import { runStaffInvitationNotificationSchedule } from "../handlers/staff-invitation-notification-schedule"
import { staffInvitationNotificationDispatch } from "./staff-invitation-notification-dispatch"

export const staffInvitationNotificationSchedule = task({
  id: "staff.invitation.notification-schedule",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: async () =>
    runStaffInvitationNotificationSchedule(process.env, {
      listDue: (input) => listDueStaffInvitationNotifications(prisma, input),
      enqueue: (input) => staffInvitationNotificationDispatch.trigger(input),
    }),
})
