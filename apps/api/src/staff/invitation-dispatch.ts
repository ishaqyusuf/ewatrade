import type { PrismaClient } from "@ewatrade/db"
import {
  type StaffInvitationNotificationIdentifier,
  findUnattemptedStaffInvitationNotification,
} from "@ewatrade/db/queries"
import { enqueueStaffInvitationNotificationDispatch } from "@ewatrade/jobs/staff-invitations"

/**
 * Call only after the invitation command committed. The saved outbox row is
 * the source of truth, so a failed enqueue never fails the command: the
 * safety-net sweeper dispatches it later.
 */
export async function dispatchStaffInvitationNotification(
  input: StaffInvitationNotificationIdentifier,
  enqueue = enqueueStaffInvitationNotificationDispatch,
) {
  try {
    await enqueue(input)
  } catch {
    console.error("[staff] invitation email dispatch deferred to recovery")
  }
}

/** Assistant confirmations return a command receipt; replays find no unattempted email. */
export async function dispatchStaffInvitationProposalEmail(
  db: Pick<PrismaClient, "staffInvitationNotification">,
  input: {
    tenantId: string
    proposal: {
      status: string
      receipt: { kind: string; recordId: string } | null
    }
  },
  enqueue = enqueueStaffInvitationNotificationDispatch,
) {
  const { proposal } = input
  if (
    proposal.status !== "COMPLETED" ||
    proposal.receipt?.kind !== "staff_invitation"
  )
    return
  try {
    const notification = await findUnattemptedStaffInvitationNotification(db, {
      tenantId: input.tenantId,
      commandId: proposal.receipt.recordId,
    })
    if (notification)
      await dispatchStaffInvitationNotification(
        { tenantId: notification.tenantId, notificationId: notification.id },
        enqueue,
      )
  } catch {
    console.error("[staff] invitation email dispatch deferred to recovery")
  }
}
