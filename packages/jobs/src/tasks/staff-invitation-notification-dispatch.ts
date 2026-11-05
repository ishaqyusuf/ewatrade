import { prisma } from "@ewatrade/db/client"
import {
  type StaffInvitationNotificationIdentifier,
  claimStaffInvitationNotification,
  finishStaffInvitationNotification,
  startStaffInvitationNotification,
} from "@ewatrade/db/queries"
import { resendEmailTransport } from "@ewatrade/email"
import { task } from "@trigger.dev/sdk/v3"
import {
  createStaffInvitationEmailAdapter,
  staffInvitationDeliveryConfigured,
} from "../handlers/staff-invitation-email"
import { runStaffInvitationNotificationDispatch } from "../handlers/staff-invitation-notification-dispatch"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"
import { STAFF_INVITATION_DISPATCH_TASK_ID } from "../staff-invitation-dispatch"

/** Kept only to drain runs queued before invitations were sent in the request. */
export const staffInvitationNotificationDispatch = task({
  id: STAFF_INVITATION_DISPATCH_TASK_ID,
  maxDuration: 120,
  // Trigger retries would bypass the outbox backoff; failures reschedule themselves.
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 5 },
  run: async (payload: StaffInvitationNotificationIdentifier) => {
    if (!staffInvitationDeliveryConfigured(process.env))
      return { deliveryConfigured: false }
    if (
      !payload ||
      Object.keys(payload).length !== 2 ||
      typeof payload.tenantId !== "string" ||
      typeof payload.notificationId !== "string" ||
      !payload.tenantId.trim() ||
      !payload.notificationId.trim() ||
      payload.tenantId.length > 160 ||
      payload.notificationId.length > 160
    )
      throw Error("Invalid staff invitation notification identity.")
    return runStaffInvitationNotificationDispatch(payload, {
      config: process.env,
      claim: (input) => claimStaffInvitationNotification(prisma, input),
      start: (input) => startStaffInvitationNotification(prisma, input),
      finish: (input) => finishStaffInvitationNotification(prisma, input),
      // No new run per retry: the row stays PENDING for the cadence sweep.
      scheduleRetry: async () => undefined,
      ...createStaffInvitationEmailAdapter(
        process.env,
        resendEmailTransport,
        assertQaJobProviderAllowed,
      ),
    })
  },
})
