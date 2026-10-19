import { generalBookingReceiptSchema } from "@ewatrade/assistant/general/booking-action"
import {
  type AssistantActionProposal,
  Prisma as PrismaValues,
} from "@ewatrade/db/browser"
import type { Prisma } from "@ewatrade/db/types"
import {
  BOOKING_DRAFT_MAX_REVISION,
  type BookingDraftConversationScope,
  bookingDraftIdentity,
  bookingDraftTargetId,
  generalBookingDraftApprovalToken,
  parseBookingDraftPayload,
  refuseBookingDraft,
} from "./general-booking-draft-contract"
import { proposalDigest } from "./proposal-security"

export function bookingDraftConversationWhere(
  scope: BookingDraftConversationScope,
) {
  return {
    id: scope.conversationId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    ownerUserId: scope.actorUserId,
    purpose: "GENERAL" as const,
    status: "ACTIVE" as const,
  }
}
export function bookingDraftWhere(
  scope: BookingDraftConversationScope,
  draftRef: string,
) {
  return {
    id: draftRef,
    conversationId: scope.conversationId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.actorUserId,
    conversation: bookingDraftConversationWhere(scope),
  }
}
export async function requireBookingDraftConversation(
  tx: Prisma.TransactionClient,
  scope: BookingDraftConversationScope,
) {
  const row = await tx.assistantConversation.findFirst({
    where: bookingDraftConversationWhere(scope),
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      ownerUserId: true,
      purpose: true,
      status: true,
    },
  })
  if (
    !row ||
    row.id !== scope.conversationId ||
    row.ownerUserId !== scope.actorUserId ||
    row.tenantId !== scope.tenantId ||
    row.storeId !== scope.storeId ||
    row.purpose !== "GENERAL" ||
    row.status !== "ACTIVE"
  )
    refuseBookingDraft("unavailable")
}
const hash = /^[a-f0-9]{64}$/
const validDate = (value: Date | null) =>
  value instanceof Date && Number.isFinite(value.getTime())
/** Integrity only. Terminal recovery must separately require actual current read
 * authority and exact canonical saved effects. No key/expiry/new readiness here.
 */
export function intactBookingDraftRow(
  row: AssistantActionProposal,
  scope: BookingDraftConversationScope,
) {
  if (
    !bookingDraftIdentity.safeParse(row.id).success ||
    !bookingDraftIdentity.safeParse(row.idempotencyKey).success ||
    row.conversationId !== scope.conversationId ||
    row.tenantId !== scope.tenantId ||
    row.storeId !== scope.storeId ||
    row.actorUserId !== scope.actorUserId ||
    row.actionVersion !== 1 ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    row.revision > BOOKING_DRAFT_MAX_REVISION ||
    !validDate(row.expiresAt) ||
    !validDate(row.createdAt) ||
    !validDate(row.updatedAt) ||
    !hash.test(row.payloadHash) ||
    !hash.test(row.approvalTokenHash) ||
    !row.targetRevision ||
    !hash.test(row.targetRevision) ||
    !["OWNER", "ADMIN", "MANAGER", "OPERATOR", "CASHIER"].includes(
      row.roleSnapshot,
    ) ||
    ![
      "PENDING",
      "EXECUTING",
      "COMPLETED",
      "CANCELLED",
      "EXPIRED",
      "FAILED",
    ].includes(row.status)
  )
    refuseBookingDraft("invalid_binding")
  const payload = parseBookingDraftPayload(row.payload)
  if (
    row.action !== payload.action ||
    row.targetRecordId !== bookingDraftTargetId(payload) ||
    proposalDigest(row.payload) !== row.payloadHash ||
    proposalDigest(payload) !== row.payloadHash
  )
    refuseBookingDraft("invalid_binding")
  if (
    (row.decidedAt !== null && !validDate(row.decidedAt)) ||
    (row.errorCode !== null &&
      (typeof row.errorCode !== "string" || !row.errorCode.length))
  )
    refuseBookingDraft("invalid_binding")
  if (
    row.status === "PENDING" &&
    (row.executedResult !== null ||
      row.errorCode !== null ||
      row.decidedAt !== null)
  )
    refuseBookingDraft("invalid_binding")
  if (
    row.status === "COMPLETED" &&
    (!validDate(row.decidedAt) ||
      row.errorCode !== null ||
      !generalBookingReceiptSchema.safeParse(row.executedResult).success)
  )
    refuseBookingDraft("invalid_binding")
  if (
    row.status === "CANCELLED" &&
    (row.executedResult !== null ||
      row.errorCode !== null ||
      !validDate(row.decidedAt))
  )
    refuseBookingDraft("invalid_binding")
  if (
    row.status !== "PENDING" &&
    row.executedResult !== null &&
    !generalBookingReceiptSchema.safeParse(row.executedResult).success
  )
    refuseBookingDraft("invalid_binding")
  return payload
}
export function requireSignedPendingBookingDraft(
  row: AssistantActionProposal,
  scope: BookingDraftConversationScope,
  secret: string,
) {
  const payload = intactBookingDraftRow(row, scope)
  if (row.status !== "PENDING") refuseBookingDraft("terminal")
  if (
    proposalDigest(generalBookingDraftApprovalToken(row, secret)) !==
    row.approvalTokenHash
  )
    refuseBookingDraft("invalid_binding")
  return payload
}
export function requireUnexpiredBookingDraft(row: AssistantActionProposal) {
  if (row.expiresAt.getTime() <= Date.now()) refuseBookingDraft("expired")
}
export async function loadBookingDraftRow(
  tx: Prisma.TransactionClient,
  scope: BookingDraftConversationScope,
  draftRef: string,
) {
  if (!bookingDraftIdentity.safeParse(draftRef).success)
    refuseBookingDraft("invalid_input")
  await requireBookingDraftConversation(tx, scope)
  const row = await tx.assistantActionProposal.findFirst({
    where: bookingDraftWhere(scope, draftRef),
  })
  if (!row || row.id !== draftRef) refuseBookingDraft("unavailable")
  return { row, payload: intactBookingDraftRow(row, scope) }
}
export function bookingDraftAppReference(row: AssistantActionProposal) {
  if (row.status !== "PENDING") refuseBookingDraft("terminal")
  return {
    draftRef: row.id,
    revision: row.revision,
    status: "PENDING" as const,
    expiresAt: row.expiresAt.toISOString(),
  }
}
export function bookingDraftCAS(
  scope: BookingDraftConversationScope,
  row: AssistantActionProposal,
) {
  return {
    ...bookingDraftWhere(scope, row.id),
    status: "PENDING" as const,
    action: row.action,
    actionVersion: row.actionVersion,
    revision: row.revision,
    payloadHash: row.payloadHash,
    idempotencyKey: row.idempotencyKey,
    roleSnapshot: row.roleSnapshot,
    targetRecordId: row.targetRecordId,
    targetRevision: row.targetRevision,
    approvalTokenHash: row.approvalTokenHash,
    expiresAt: row.expiresAt,
    executedResult: { equals: PrismaValues.AnyNull },
    errorCode: null,
    decidedAt: null,
  }
}
