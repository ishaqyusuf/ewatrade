import type { StaffInvitationNotificationIdentifier } from "@ewatrade/db/queries"
import { idempotencyKeys } from "@trigger.dev/sdk/v3"
import { triggerTaskOnce } from "./trigger"

export const STAFF_INVITATION_DISPATCH_TASK_ID =
  "staff.invitation.notification-dispatch"
/**
 * Dedupes command replays, a racing sweep and a retried parent run for one
 * attempt. It is shorter than the sweeper's overdue grace, so a run that died
 * before claiming never blocks the sweeper from dispatching that attempt again.
 */
export const STAFF_INVITATION_DISPATCH_KEY_TTL = "10m"
/** The sweeper only picks up work this overdue: event/retry runs own the rest. */
export const STAFF_INVITATION_SWEEP_OVERDUE_MS = 15 * 60_000

export type StaffInvitationDispatchRequest =
  StaffInvitationNotificationIdentifier & {
    /** 1 for the first send; the dispatch run passes the next attempt. */
    attempt?: number
    runAt?: Date
  }

export function staffInvitationDispatchKey(input: {
  notificationId: string
  attempt?: number
}) {
  return `staff-invitation:${input.notificationId}:attempt:${input.attempt ?? 1}`
}

/** Options for `task.trigger` from inside a run (sweeper or retry). */
export async function staffInvitationDispatchOptions(
  input: StaffInvitationDispatchRequest,
) {
  return {
    delay: input.runAt,
    idempotencyKey: await idempotencyKeys.create(
      staffInvitationDispatchKey(input),
      { scope: "global" },
    ),
    idempotencyKeyTTL: STAFF_INVITATION_DISPATCH_KEY_TTL,
  }
}

/**
 * One Trigger run per saved invitation email, started after the command
 * commits. The payload is ID-only; the durable outbox stays the source of
 * truth, so `false` (Trigger not configured) leaves it for the sweeper.
 */
export function enqueueStaffInvitationNotificationDispatch(
  input: StaffInvitationDispatchRequest,
) {
  return triggerTaskOnce(
    STAFF_INVITATION_DISPATCH_TASK_ID,
    { tenantId: input.tenantId, notificationId: input.notificationId },
    {
      delay: input.runAt,
      idempotencyKey: staffInvitationDispatchKey(input),
      idempotencyKeyTTL: STAFF_INVITATION_DISPATCH_KEY_TTL,
    },
  )
}
