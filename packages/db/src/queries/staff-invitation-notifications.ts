import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"

import {
  type StaffInvitationNotificationRow as Row,
  lockStaffInvitationNotification as locked,
} from "./staff-invitation-notification-lock"

type Tx = Prisma.TransactionClient
export type StaffInvitationNotificationIdentifier = {
  tenantId: string
  notificationId: string
}
const MAX_ATTEMPTS = 3
const LEASE_MS = 5 * 60_000

async function authorized(tx: Tx, row: Row, now: Date) {
  const [actor] = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT m."id" FROM "Membership" m
    JOIN "Tenant" t ON t."id"=m."tenantId" AND t."isActive"=true
    WHERE m."tenantId"=${row.tenantId} AND m."userId"=${row.command.actorUserId}
      AND m."status"='ACTIVE' AND m."role" IN ('OWNER', 'ADMIN') FOR SHARE OF m`
  return Boolean(
    actor &&
      row.invitation.status === "ACTIVE" &&
      row.invitation.expiresAt > now &&
      row.membership.status === "INVITED" &&
      row.membership.role === row.invitation.role &&
      ["CASHIER", "OPERATOR", "MANAGER"].includes(row.membership.role) &&
      row.membership.userId === row.invitation.invitedUserId &&
      row.membership.user.email === row.invitation.email &&
      row.membership.staffStoreAssignments.some(
        (a) =>
          a.storeId === row.membership.retailOpsStaffProfile?.defaultStoreId,
      ),
  )
}
async function cancel(tx: Tx, row: Row, now: Date, failureCode: string) {
  await tx.staffInvitationNotification.update({
    where: { id: row.id },
    data: {
      status: "CANCELLED",
      failureCode,
      cancelledAt: now,
      payloadCiphertext: null,
      claimId: null,
      claimExpiresAt: null,
    },
  })
  await tx.staffInvitationNotificationAttempt.updateMany({
    where: {
      notificationId: row.id,
      tenantId: row.tenantId,
      status: "CLAIMED",
    },
    data: { status: "CANCELLED", failureCode, completedAt: now },
  })
}

export async function cancelStaffInvitationNotificationsInTransaction(
  tx: Tx,
  input: { tenantId: string; invitationId: string; now?: Date },
) {
  const now = input.now ?? new Date()
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT "id" FROM "StaffInvitationNotification" WHERE "tenantId"=${input.tenantId} AND "invitationId"=${input.invitationId} AND "status" IN ('PENDING', 'CLAIMED', 'FAILED') ORDER BY "id" FOR UPDATE`
  if (!rows.length) return
  const ids = rows.map((row) => row.id)
  await tx.staffInvitationNotification.updateMany({
    where: {
      id: { in: ids },
      tenantId: input.tenantId,
      status: { in: ["PENDING", "CLAIMED", "FAILED"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      payloadCiphertext: null,
      claimId: null,
      claimExpiresAt: null,
    },
  })
  await tx.staffInvitationNotificationAttempt.updateMany({
    where: {
      notificationId: { in: ids },
      tenantId: input.tenantId,
      status: "CLAIMED",
    },
    data: { status: "CANCELLED", completedAt: now },
  })
}

/** Internal worker discovery only. SENDING/unknown delivery is never requeued. */
export async function listDueStaffInvitationNotifications(
  db: PrismaClient,
  input: { limit?: number; now?: Date } = {},
) {
  const now = input.now ?? new Date()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  return db.staffInvitationNotification.findMany({
    where: {
      OR: [
        {
          status: { in: ["PENDING", "FAILED"] },
          nextAttemptAt: { lte: now },
          attemptCount: { lt: MAX_ATTEMPTS },
        },
        {
          status: { in: ["CLAIMED", "SENDING"] },
          claimExpiresAt: { lte: now },
        },
      ],
    },
    select: { tenantId: true, id: true },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: limit,
  })
}

export async function claimStaffInvitationNotificationInTransaction(
  tx: Tx,
  input: StaffInvitationNotificationIdentifier & { now?: Date },
) {
  const now = input.now ?? new Date()
  const row = await locked(tx, input)
  if (!row) return null
  if (
    row.status === "SENDING" &&
    row.claimExpiresAt &&
    row.claimExpiresAt <= now
  ) {
    await tx.staffInvitationNotification.update({
      where: { id: row.id },
      data: { status: "OUTCOME_UNKNOWN", failureCode: "SEND_LEASE_EXPIRED" },
    })
    await tx.staffInvitationNotificationAttempt.updateMany({
      where: {
        notificationId: row.id,
        tenantId: row.tenantId,
        number: row.attemptCount,
        status: "SENDING",
      },
      data: {
        status: "OUTCOME_UNKNOWN",
        failureCode: "SEND_LEASE_EXPIRED",
        completedAt: now,
      },
    })
    return null
  }
  const reclaim =
    row.status === "CLAIMED" && row.claimExpiresAt && row.claimExpiresAt <= now
  if (reclaim && row.attemptCount >= MAX_ATTEMPTS) {
    await cancel(tx, row, now, "CLAIM_ATTEMPTS_EXHAUSTED")
    return null
  }
  if (
    !(row.status === "PENDING" || row.status === "FAILED" || reclaim) ||
    row.nextAttemptAt > now ||
    row.attemptCount >= MAX_ATTEMPTS
  )
    return null
  if (!row.payloadCiphertext || !(await authorized(tx, row, now))) {
    await cancel(tx, row, now, "INVITATION_UNAVAILABLE")
    return null
  }
  if (reclaim)
    await tx.staffInvitationNotificationAttempt.updateMany({
      where: {
        notificationId: row.id,
        tenantId: row.tenantId,
        number: row.attemptCount,
        status: "CLAIMED",
      },
      data: {
        status: "CANCELLED",
        failureCode: "CLAIM_LEASE_EXPIRED",
        completedAt: now,
      },
    })
  const claimId = randomUUID()
  const number = row.attemptCount + 1
  await tx.staffInvitationNotification.update({
    where: { id: row.id },
    data: {
      status: "CLAIMED",
      claimId,
      claimExpiresAt: new Date(now.getTime() + LEASE_MS),
      attemptCount: number,
      failureCode: null,
    },
  })
  await tx.staffInvitationNotificationAttempt.create({
    data: {
      tenantId: row.tenantId,
      notificationId: row.id,
      number,
      status: "CLAIMED",
      startedAt: now,
    },
  })
  return {
    tenantId: row.tenantId,
    membershipId: row.membershipId,
    invitationId: row.invitationId,
    notificationId: row.id,
    payloadHash: row.payloadHash,
    payloadCiphertext: row.payloadCiphertext,
    encryptionKeyId: row.encryptionKeyId,
    claimId,
    currentAccessRevision: row.membership.staffAccessRevision,
    currentEmail: row.invitation.email,
    tokenHash: row.invitation.tokenHash,
    providerIdempotencyKey: `staff-invitation:${row.id}`,
  }
}
export async function claimStaffInvitationNotification(
  db: PrismaClient,
  input: StaffInvitationNotificationIdentifier & { now?: Date },
) {
  return db.$transaction(
    (tx) => claimStaffInvitationNotificationInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/** Final fresh authorization immediately before an external provider call. */
export async function startStaffInvitationNotificationInTransaction(
  tx: Tx,
  input: StaffInvitationNotificationIdentifier & {
    claimId: string
    expectedAccessRevision: number
    now?: Date
  },
) {
  const now = input.now ?? new Date()
  const row = await locked(tx, input)
  if (
    !row ||
    row.status !== "CLAIMED" ||
    row.claimId !== input.claimId ||
    !row.claimExpiresAt ||
    row.claimExpiresAt <= now
  )
    return false
  if (
    row.membership.staffAccessRevision !== input.expectedAccessRevision ||
    !(await authorized(tx, row, now))
  ) {
    await cancel(tx, row, now, "INVITATION_CHANGED")
    return false
  }
  await tx.staffInvitationNotification.update({
    where: { id: row.id },
    data: {
      status: "SENDING",
      sendStartedAt: now,
      claimExpiresAt: new Date(now.getTime() + LEASE_MS),
    },
  })
  await tx.staffInvitationNotificationAttempt.updateMany({
    where: {
      notificationId: row.id,
      tenantId: row.tenantId,
      number: row.attemptCount,
      status: "CLAIMED",
    },
    data: { status: "SENDING" },
  })
  return true
}
export async function startStaffInvitationNotification(
  db: PrismaClient,
  input: StaffInvitationNotificationIdentifier & {
    claimId: string
    expectedAccessRevision: number
    now?: Date
  },
) {
  return db.$transaction(
    (tx) => startStaffInvitationNotificationInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

type Completion = StaffInvitationNotificationIdentifier & {
  claimId: string
  payloadHash: string
  now?: Date
} & (
    | { outcome: "SENT"; providerKey: string; providerMessageId: string }
    | {
        outcome: "FAILED" | "OUTCOME_UNKNOWN"
        failureCode:
          | "PROVIDER_REJECTED"
          | "PROVIDER_OUTCOME_UNKNOWN"
          | "PROVIDER_UNAVAILABLE"
          | "CUSTODY_UNAVAILABLE"
          | "PAYLOAD_CHANGED"
      }
  )

/** Provider acceptance is SENT, not proof of inbox delivery. Late known results may resolve unknown. */
export async function finishStaffInvitationNotificationInTransaction(
  tx: Tx,
  input: Completion,
) {
  const now = input.now ?? new Date()
  const row = await locked(tx, input)
  if (
    !row ||
    row.claimId !== input.claimId ||
    row.payloadHash !== input.payloadHash
  )
    return false
  if (row.status === "SENT" || row.status === "DELIVERED")
    return (
      input.outcome === "SENT" &&
      row.providerKey === input.providerKey &&
      row.providerMessageId === input.providerMessageId
    )
  const preSendFailure =
    row.status === "CLAIMED" &&
    input.outcome === "FAILED" &&
    ["CUSTODY_UNAVAILABLE", "PAYLOAD_CHANGED", "PROVIDER_UNAVAILABLE"].includes(
      input.failureCode,
    )
  if (!preSendFailure && !["SENDING", "OUTCOME_UNKNOWN"].includes(row.status))
    return false
  if (
    input.outcome === "FAILED" &&
    !preSendFailure &&
    input.failureCode !== "PROVIDER_REJECTED"
  )
    return false
  if (
    input.outcome === "OUTCOME_UNKNOWN" &&
    input.failureCode !== "PROVIDER_OUTCOME_UNKNOWN"
  )
    return false
  if (
    input.outcome === "SENT" &&
    (!input.providerKey ||
      input.providerKey.length > 80 ||
      !input.providerMessageId ||
      input.providerMessageId.length > 512)
  )
    return false
  const failureCode = input.outcome === "SENT" ? null : input.failureCode
  const terminalPreSendFailure =
    preSendFailure &&
    input.outcome === "FAILED" &&
    input.failureCode === "PAYLOAD_CHANGED"
  const state = terminalPreSendFailure ? ("CANCELLED" as const) : input.outcome
  const data = {
    status: state,
    failureCode,
    ...(input.outcome === "SENT"
      ? {
          providerKey: input.providerKey,
          providerMessageId: input.providerMessageId,
          sentAt: now,
          payloadCiphertext: null,
        }
      : {}),
    ...(terminalPreSendFailure
      ? { cancelledAt: now, payloadCiphertext: null }
      : {}),
    ...(input.outcome === "FAILED"
      ? {
          ...(row.attemptCount >= MAX_ATTEMPTS
            ? { payloadCiphertext: null }
            : {}),
          nextAttemptAt: new Date(
            now.getTime() + 60_000 * 2 ** Math.max(row.attemptCount - 1, 0),
          ),
        }
      : {}),
  }
  await tx.staffInvitationNotification.update({ where: { id: row.id }, data })
  await tx.staffInvitationNotificationAttempt.updateMany({
    where: {
      notificationId: row.id,
      tenantId: row.tenantId,
      number: row.attemptCount,
    },
    data: {
      status: state,
      failureCode,
      completedAt: now,
      ...(input.outcome === "SENT"
        ? {
            providerKey: input.providerKey,
            providerMessageId: input.providerMessageId,
          }
        : {}),
    },
  })
  if (input.outcome === "SENT")
    await tx.retailOpsStaffInviteToken.update({
      where: { id: row.invitationId },
      data: { sentAt: now },
    })
  return true
}
export async function finishStaffInvitationNotification(
  db: PrismaClient,
  input: Completion,
) {
  return db.$transaction(
    (tx) => finishStaffInvitationNotificationInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/** Trusted verified provider-event adapter only; never accept a browser/model delivery assertion. */
export async function recordStaffInvitationDeliveredInTransaction(
  tx: Tx,
  input: StaffInvitationNotificationIdentifier & {
    providerKey: string
    providerMessageId: string
    payloadHash: string
    deliveredAt: Date
  },
) {
  const row = await locked(tx, input)
  if (
    !row ||
    !["SENT", "DELIVERED"].includes(row.status) ||
    row.providerKey !== input.providerKey ||
    row.providerMessageId !== input.providerMessageId ||
    row.payloadHash !== input.payloadHash ||
    !Number.isFinite(input.deliveredAt.getTime()) ||
    !row.sentAt ||
    input.deliveredAt < row.sentAt
  )
    return false
  if (row.status === "DELIVERED")
    return row.deliveredAt?.getTime() === input.deliveredAt.getTime()
  await tx.staffInvitationNotification.update({
    where: { id: row.id },
    data: { status: "DELIVERED", deliveredAt: input.deliveredAt },
  })
  await tx.staffInvitationNotificationAttempt.updateMany({
    where: {
      notificationId: row.id,
      tenantId: row.tenantId,
      number: row.attemptCount,
      status: "SENT",
    },
    data: { status: "DELIVERED" },
  })
  return true
}
