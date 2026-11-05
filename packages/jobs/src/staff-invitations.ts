import type { RetailOpsStaffInvitedPayload } from "@ewatrade/notifications"
import {
  type NotificationDispatchPayload,
  notificationDispatchHandler,
} from "./handlers/notification-dispatch"

export * from "./staff-invitation-dispatch"
export * from "./staff-invitation-send"
export * from "./staff-invite-whatsapp"

export async function enqueueRetailOpsStaffInviteNotification(
  input: RetailOpsStaffInvitedPayload,
) {
  const payload: NotificationDispatchPayload = {
    payload: input,
    type: "retail_ops_staff_invited",
  }

  // Sent in the request: the infra budget allows no Trigger run per invite.
  // The invite is already saved, so a failed email never fails it; the owner
  // can resend the invite.
  try {
    await notificationDispatchHandler(payload, 1)
  } catch {
    console.error("[staff] invitation email could not be sent")
  }
}
