import type { RetailOpsStaffInvitedPayload } from "@ewatrade/notifications"
import {
  type NotificationDispatchPayload,
  notificationDispatchHandler,
} from "./handlers/notification-dispatch"
import { jobIds } from "./job-ids"
import { triggerJob } from "./trigger"

export * from "./staff-invitation-dispatch"

export async function enqueueRetailOpsStaffInviteNotification(
  input: RetailOpsStaffInvitedPayload,
) {
  const payload: NotificationDispatchPayload = {
    payload: input,
    type: "retail_ops_staff_invited",
  }

  await triggerJob(
    jobIds.notificationDispatch,
    notificationDispatchHandler,
    payload,
  )
}
