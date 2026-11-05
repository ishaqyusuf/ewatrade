export const STAFF_INVITATION_DISPATCH_TASK_ID =
  "staff.invitation.notification-dispatch"
/**
 * The request sends first; the cadence sweep sends retries and recovers rows a
 * crashed request left behind. The grace only keeps it off a send in flight.
 */
export const STAFF_INVITATION_SWEEP_OVERDUE_MS = 2 * 60_000
