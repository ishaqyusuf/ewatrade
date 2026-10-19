import type { AssistantActionProposal } from "@ewatrade/db/browser"
import type { Prisma } from "@ewatrade/db/types"
import { z } from "zod"
import {
  BOOKING_DRAFT_MAX_REVISION,
  type BookingDraftConversationScope,
  bookingDraftIdentity,
  bookingDraftOriginal,
  bookingDraftScopeSchema,
  bookingDraftSigningKey,
  bookingDraftSnapshot,
  generalBookingDraftApprovalToken,
  parseBookingDraftPayload,
  refuseBookingDraft,
} from "./general-booking-draft-contract"
import {
  requireCurrentBookingDraftReview,
  reviewBookingDraft,
} from "./general-booking-draft-review"
import {
  bookingDraftAppReference,
  bookingDraftCAS,
  loadBookingDraftRow,
  requireBookingDraftConversation,
  requireSignedPendingBookingDraft,
  requireUnexpiredBookingDraft,
} from "./general-booking-draft-row"
import { generalBookingNativeInput } from "./general-booking-input"
import { proposalDigest } from "./proposal-security"

export {
  GeneralBookingDraftStoreError,
  generalBookingDraftApprovalToken,
  type GeneralBookingDraftScope,
} from "./general-booking-draft-contract"
const createSchema = bookingDraftScopeSchema
  .extend({ payload: z.unknown() })
  .strict()
const readSchema = bookingDraftScopeSchema
  .extend({ draftRef: bookingDraftIdentity })
  .strict()
const editSchema = bookingDraftScopeSchema
  .extend({ request: z.unknown() })
  .strict()
const idsSchema = z
  .object({
    proposalId: bookingDraftIdentity,
    idempotencyKey: bookingDraftIdentity,
  })
  .strict()
const editRequestSchema = z
  .object({
    draftRef: bookingDraftIdentity,
    revision: z.number().int().min(1).max(BOOKING_DRAFT_MAX_REVISION),
    payload: z.unknown(),
  })
  .strict()
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(bookingDraftSnapshot(raw))
  if (!result.success) refuseBookingDraft("invalid_input")
  return result.data
}
function scope(
  input: BookingDraftConversationScope,
): BookingDraftConversationScope {
  return {
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    storeId: input.storeId,
    conversationId: input.conversationId,
  }
}
type ExpectedBinding = Pick<
  AssistantActionProposal,
  | "id"
  | "action"
  | "actionVersion"
  | "revision"
  | "payloadHash"
  | "idempotencyKey"
  | "roleSnapshot"
  | "targetRecordId"
  | "targetRevision"
  | "expiresAt"
  | "approvalTokenHash"
>
async function readBack(
  tx: Prisma.TransactionClient,
  current: BookingDraftConversationScope,
  expected: ExpectedBinding,
  key: string,
) {
  const saved = await loadBookingDraftRow(tx, current, expected.id)
  requireSignedPendingBookingDraft(saved.row, current, key)
  for (const field of [
    "id",
    "action",
    "actionVersion",
    "revision",
    "payloadHash",
    "idempotencyKey",
    "roleSnapshot",
    "targetRecordId",
    "targetRevision",
    "approvalTokenHash",
  ] as const)
    if (saved.row[field] !== expected[field])
      refuseBookingDraft("invalid_binding")
  if (saved.row.expiresAt.getTime() !== expected.expiresAt.getTime())
    refuseBookingDraft("invalid_binding")
  requireUnexpiredBookingDraft(saved.row)
  return bookingDraftAppReference(saved.row)
}

/** UNEXPOSED internal composer. Caller owns fresh authenticated GENERAL/current
 * domain/client/rollout authority and ONE Serializable TX. Allocate both server
 * IDs once OUTSIDE retries. Only proposal staging occurs, never booking writes,
 * token/cipher preparation, provider/screening, nested TX or execution.
 * Any error, including readback failure, must roll back the owning transaction.
 */
export async function createGeneralBookingDraftInTransaction(
  tx: Prisma.TransactionClient,
  raw: BookingDraftConversationScope & { payload: unknown },
  serverIds: { proposalId: string; idempotencyKey: string },
  secret: string,
) {
  const input = parse(createSchema, raw)
  const current = scope(input)
  const ids = parse(idsSchema, serverIds)
  const key = bookingDraftSigningKey(secret)
  const payload = parseBookingDraftPayload(input.payload)
  await requireBookingDraftConversation(tx, current)
  const byId = await tx.assistantActionProposal.findUnique({
    where: { id: ids.proposalId },
  })
  const byKey = await tx.assistantActionProposal.findUnique({
    where: {
      tenantId_actorUserId_idempotencyKey: {
        tenantId: current.tenantId,
        actorUserId: current.actorUserId,
        idempotencyKey: ids.idempotencyKey,
      },
    },
  })
  if (byId || byKey) {
    if (
      !byId ||
      !byKey ||
      byId.id !== byKey.id ||
      byId.id !== ids.proposalId ||
      byId.idempotencyKey !== ids.idempotencyKey
    )
      refuseBookingDraft("idempotency_conflict")
    const previous = requireSignedPendingBookingDraft(byId, current, key)
    if (proposalDigest(previous) !== proposalDigest(payload))
      refuseBookingDraft("idempotency_conflict")
    requireUnexpiredBookingDraft(byId)
    const fresh = await reviewBookingDraft(
      tx,
      current,
      previous,
      byId.idempotencyKey,
    )
    requireCurrentBookingDraftReview(byId, fresh.review)
    requireUnexpiredBookingDraft(byId)
    return bookingDraftAppReference(byId)
  }
  const fresh = await reviewBookingDraft(
    tx,
    current,
    payload,
    ids.idempotencyKey,
  )
  const binding = {
    id: ids.proposalId,
    conversationId: current.conversationId,
    tenantId: current.tenantId,
    storeId: current.storeId,
    actorUserId: current.actorUserId,
    action: payload.action,
    actionVersion: 1,
    revision: 1,
    payloadHash: proposalDigest(payload),
    idempotencyKey: ids.idempotencyKey,
    roleSnapshot: fresh.review.review.authority.role,
    targetRecordId: fresh.review.target.id,
    targetRevision: fresh.review.target.revision,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  }
  const approvalTokenHash = proposalDigest(
    generalBookingDraftApprovalToken(binding, key),
  )
  await tx.assistantActionProposal.create({
    data: { ...binding, status: "PENDING", payload, approvalTokenHash },
  })
  return readBack(tx, current, { ...binding, approvalTokenHash }, key)
}

/** SERVER ONLY: full private row, intention, native input and fresh complete
 * review. Callers must not return this object as an app/model/history DTO.
 */
export async function readGeneralBookingDraftInTransaction(
  tx: Prisma.TransactionClient,
  raw: BookingDraftConversationScope & { draftRef: string },
  secret: string,
) {
  const input = parse(readSchema, raw)
  const current = scope(input)
  const key = bookingDraftSigningKey(secret)
  const saved = await loadBookingDraftRow(tx, current, input.draftRef)
  requireSignedPendingBookingDraft(saved.row, current, key)
  requireUnexpiredBookingDraft(saved.row)
  const fresh = await reviewBookingDraft(
    tx,
    current,
    saved.payload,
    saved.row.idempotencyKey,
  )
  requireCurrentBookingDraftReview(saved.row, fresh.review)
  requireUnexpiredBookingDraft(saved.row)
  return { ...saved, ...fresh, appRef: bookingDraftAppReference(saved.row) }
}

/** Explicit full edit refreshes the exact same operation and review; expired
 * PENDING may be renewed, never terminal/unknown execution. The old signature is
 * required; key rotation cannot silently reinterpret pending approval.
 */
export async function editGeneralBookingDraftInTransaction(
  tx: Prisma.TransactionClient,
  raw: BookingDraftConversationScope & { request: unknown },
  secret: string,
) {
  const input = parse(editSchema, raw)
  const current = scope(input)
  const request = parse(editRequestSchema, input.request)
  const payload = parseBookingDraftPayload(request.payload)
  const key = bookingDraftSigningKey(secret)
  const saved = await loadBookingDraftRow(tx, current, request.draftRef)
  requireSignedPendingBookingDraft(saved.row, current, key)
  if (
    request.revision !== saved.row.revision ||
    saved.row.revision === BOOKING_DRAFT_MAX_REVISION
  )
    refuseBookingDraft("stale_draft")
  if (
    proposalDigest(bookingDraftOriginal(payload)) !==
    proposalDigest(bookingDraftOriginal(saved.payload))
  )
    refuseBookingDraft("invalid_binding")
  const fresh = await reviewBookingDraft(
    tx,
    current,
    payload,
    saved.row.idempotencyKey,
  )
  const binding = {
    ...saved.row,
    payloadHash: proposalDigest(payload),
    revision: saved.row.revision + 1,
    targetRecordId: fresh.review.target.id,
    targetRevision: fresh.review.target.revision,
    roleSnapshot: fresh.review.review.authority.role,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  }
  const approvalTokenHash = proposalDigest(
    generalBookingDraftApprovalToken(binding, key),
  )
  const changed = await tx.assistantActionProposal.updateMany({
    where: bookingDraftCAS(current, saved.row),
    data: {
      payload,
      payloadHash: binding.payloadHash,
      revision: binding.revision,
      targetRecordId: binding.targetRecordId,
      targetRevision: binding.targetRevision,
      roleSnapshot: binding.roleSnapshot,
      expiresAt: binding.expiresAt,
      approvalTokenHash,
    },
  })
  if (changed.count !== 1) refuseBookingDraft("stale_draft")
  return readBack(tx, current, { ...binding, approvalTokenHash }, key)
}

/** SERVER ONLY integrity inspection for future terminal-first confirmation.
 * This does NOT authorize recovery or establish native saved-effect truth. It
 * intentionally checks no current signing key, expiry or new-booking readiness.
 * Future composer must require fresh caller/native recovery authority and exact
 * immutable canonical receipt before returning any terminal app result.
 */
export async function inspectGeneralBookingDraftRowInTransaction(
  tx: Prisma.TransactionClient,
  raw: BookingDraftConversationScope & { draftRef: string },
) {
  const input = parse(readSchema, raw)
  const current = scope(input)
  const saved = await loadBookingDraftRow(tx, current, input.draftRef)
  const nativeInput = generalBookingNativeInput(
    saved.payload,
    {
      actorUserId: current.actorUserId,
      tenantId: current.tenantId,
      storeId: current.storeId,
    },
    saved.row.idempotencyKey,
  )
  return { ...saved, nativeInput }
}
