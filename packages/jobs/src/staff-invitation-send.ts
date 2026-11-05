import {
  type StaffInvitationNotificationIdentifier,
  claimStaffInvitationNotification,
  finishStaffInvitationNotification,
  startStaffInvitationNotification,
} from "@ewatrade/db/queries"
import { resendEmailTransport } from "@ewatrade/email"
import {
  createStaffInvitationEmailAdapter,
  staffInvitationDeliveryConfigured,
} from "./handlers/staff-invitation-email"
import { runStaffInvitationNotificationDispatch } from "./handlers/staff-invitation-notification-dispatch"

/**
 * Sends one saved invitation email in the calling process, with no Trigger
 * run (the infra budget allows no run per invite). A failed attempt stays
 * PENDING with its backoff; the cadence sweep sends it, and recovers rows a
 * crashed caller left behind. The claim lease keeps the two from double-sending.
 */
export async function sendStaffInvitationNotificationNow(
  input: StaffInvitationNotificationIdentifier,
  config: NodeJS.ProcessEnv = process.env,
) {
  if (!staffInvitationDeliveryConfigured(config))
    return { deliveryConfigured: false }
  // Loaded on use so importing the producer needs no database settings.
  const [{ prisma }, { assertQaJobProviderAllowed }] = await Promise.all([
    import("@ewatrade/db/client"),
    import("./qa-provider-guard"),
  ])
  return runStaffInvitationNotificationDispatch(input, {
    config,
    claim: (identity) => claimStaffInvitationNotification(prisma, identity),
    start: (identity) => startStaffInvitationNotification(prisma, identity),
    finish: (identity) => finishStaffInvitationNotification(prisma, identity),
    scheduleRetry: async () => undefined,
    ...createStaffInvitationEmailAdapter(
      config,
      resendEmailTransport,
      assertQaJobProviderAllowed,
    ),
  })
}
