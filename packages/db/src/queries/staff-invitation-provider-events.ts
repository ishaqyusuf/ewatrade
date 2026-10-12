import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { lockStaffInvitationNotification } from "./staff-invitation-notification-lock"
import type { StaffInvitationNotificationIdentifier } from "./staff-invitation-notifications"

export type StaffInvitationProviderEvent =
  StaffInvitationNotificationIdentifier & {
    type:
      | "email.sent"
      | "email.delivered"
      | "email.bounced"
      | "email.failed"
      | "email.complained"
      | "email.suppressed"
    payloadHash: string
    providerMessageId: string
    acceptedAt: Date
    occurredAt: Date
    now?: Date
  }
const failurePriority: Record<string, number> = {
  PROVIDER_FAILED: 1,
  PROVIDER_SUPPRESSED: 2,
  PROVIDER_BOUNCED: 3,
  PROVIDER_COMPLAINED: 4,
}
const failures = {
  "email.failed": "PROVIDER_FAILED",
  "email.suppressed": "PROVIDER_SUPPRESSED",
  "email.bounced": "PROVIDER_BOUNCED",
  "email.complained": "PROVIDER_COMPLAINED",
} as const

/** Only verified provider callbacks may call this; no browser/model assertions. */
export async function reconcileStaffInvitationProviderEventInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffInvitationProviderEvent,
) {
  const now = input.now ?? new Date()
  const skew = 5 * 60_000
  if (
    !input.providerMessageId.trim() ||
    input.providerMessageId.length > 512 ||
    !/^[a-f0-9]{64}$/.test(input.payloadHash) ||
    !Number.isFinite(input.acceptedAt.getTime()) ||
    !Number.isFinite(input.occurredAt.getTime()) ||
    input.occurredAt < input.acceptedAt ||
    input.occurredAt.getTime() > now.getTime() + skew
  )
    return { recorded: false }
  const row = await lockStaffInvitationNotification(tx, input)
  if (
    !row ||
    !["SENDING", "OUTCOME_UNKNOWN", "SENT", "DELIVERED"].includes(row.status) ||
    row.payloadHash !== input.payloadHash ||
    row.attemptCount < 1 ||
    !row.claimId ||
    !row.sendStartedAt ||
    input.acceptedAt.getTime() < row.sendStartedAt.getTime() - skew ||
    (row.providerKey !== null && row.providerKey !== "resend") ||
    (row.providerMessageId !== null &&
      row.providerMessageId !== input.providerMessageId)
  )
    return { recorded: false }

  // Provider timestamps may precede the worker's local persistence timestamp.
  const sentAt =
    row.sentAt && row.sentAt < input.acceptedAt ? row.sentAt : input.acceptedAt
  const incomingFailure =
    input.type in failures
      ? failures[input.type as keyof typeof failures]
      : null
  const oldFailure =
    row.failureCode && row.failureCode in failurePriority
      ? row.failureCode
      : null
  const failureCode =
    incomingFailure &&
    (failurePriority[incomingFailure] ?? 0) >
      (failurePriority[oldFailure ?? ""] ?? 0)
      ? incomingFailure
      : oldFailure
  const deliveredAt =
    input.type === "email.delivered"
      ? row.deliveredAt && row.deliveredAt < input.occurredAt
        ? row.deliveredAt
        : input.occurredAt
      : row.deliveredAt
  const status = deliveredAt ? ("DELIVERED" as const) : ("SENT" as const)
  const replay =
    row.status === status &&
    row.providerKey === "resend" &&
    row.providerMessageId === input.providerMessageId &&
    row.sentAt?.getTime() === sentAt.getTime() &&
    row.deliveredAt?.getTime() === deliveredAt?.getTime() &&
    row.failureCode === failureCode &&
    row.payloadCiphertext === null
  if (replay) return { recorded: true, replay: true }
  await tx.staffInvitationNotification.update({
    where: { id: row.id },
    data: {
      status,
      sentAt,
      deliveredAt,
      failureCode,
      providerKey: "resend",
      providerMessageId: input.providerMessageId,
      payloadCiphertext: null,
      claimExpiresAt: null,
    },
  })
  const attempt = await tx.staffInvitationNotificationAttempt.updateMany({
    where: {
      notificationId: row.id,
      tenantId: row.tenantId,
      number: row.attemptCount,
    },
    data: {
      status,
      failureCode,
      providerKey: "resend",
      providerMessageId: input.providerMessageId,
      completedAt: now,
    },
  })
  if (attempt.count !== 1)
    throw Error("Original invitation send attempt is unavailable.")
  await tx.retailOpsStaffInviteToken.update({
    where: { id: row.invitationId },
    data: { sentAt },
  })
  return { recorded: true, replay: false }
}

export async function reconcileStaffInvitationProviderEvent(
  db: PrismaClient,
  input: StaffInvitationProviderEvent,
) {
  return db.$transaction(
    (tx) => reconcileStaffInvitationProviderEventInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
