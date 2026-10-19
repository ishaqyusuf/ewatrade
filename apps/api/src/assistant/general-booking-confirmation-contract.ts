import { timingSafeEqual } from "node:crypto"
import { generalBookingReceiptSchema } from "@ewatrade/assistant/general/booking-action"
import {
  type AssistantActionProposal,
  Prisma as PrismaValues,
} from "@ewatrade/db/browser"
import { assertCommerceQuoteReviewBudget } from "@ewatrade/db/commerce-quote-review-budget"
import type { Prisma } from "@ewatrade/db/types"
import { z } from "zod"
import {
  type BookingDraftConversationScope,
  type GeneralBookingDraftScope,
  bookingDraftIdentity,
  bookingDraftScopeSchema,
  bookingDraftSnapshot,
} from "./general-booking-draft-contract"
import { bookingDraftWhere } from "./general-booking-draft-row"
import { generalBookingDraftApprovalToken } from "./general-booking-draft-store"
import { proposalDigest } from "./proposal-security"

const requestSchema = z
  .object({
    conversationId: bookingDraftScopeSchema.shape.conversationId,
    draftRef: bookingDraftIdentity,
    revision: z.number().int().min(1).max(2_147_483_647),
    decision: z.enum(["confirm", "cancel"]),
    approvalToken: z.string().max(128).optional(),
  })
  .strict()
const scopeSchema = bookingDraftScopeSchema.omit({ conversationId: true })
export type BookingConfirmationRequest = z.infer<typeof requestSchema>
export type BookingConfirmationReceipt = z.infer<
  typeof generalBookingReceiptSchema
>
export type GeneralBookingConfirmationResult =
  | {
      kind: "completed"
      draftRef: string
      revision: number
      receipt: BookingConfirmationReceipt
      recovered: boolean
    }
  | { kind: "cancelled"; draftRef: string; revision: number }
/** SERVER ONLY: dispatch IDs are not persisted/public receipt data. Enqueue only after COMMIT. */
export type GeneralBookingConfirmationOutcome = {
  result: GeneralBookingConfirmationResult
  notificationDispatches: Array<{ actorUserId: string; intentId: string }>
}
export class GeneralBookingConfirmationError extends Error {
  readonly code = "BOOKING_CONFIRMATION_CONFLICT"
  constructor(
    readonly reason:
      | "invalid_request"
      | "unavailable"
      | "stale"
      | "approval_unavailable"
      | "preparation_required"
      | "saved_result_unavailable"
      | "unknown_effect"
      | "effect_conflict",
  ) {
    super(
      "Keep this booking draft's original identity and check its saved result before trying again.",
    )
    this.name = "GeneralBookingConfirmationError"
  }
}
export function refuseBookingConfirmation(
  reason: GeneralBookingConfirmationError["reason"],
): never {
  throw new GeneralBookingConfirmationError(reason)
}
export function bookingConfirmationInputs(
  serverScope: GeneralBookingDraftScope,
  raw: unknown,
) {
  try {
    assertCommerceQuoteReviewBudget({ scope: serverScope, json: raw }, 4096)
    return {
      scope: scopeSchema.parse(bookingDraftSnapshot(serverScope)),
      request: requestSchema.parse(bookingDraftSnapshot(raw)),
    }
  } catch {
    return refuseBookingConfirmation("invalid_request")
  }
}
export function bookingConfirmationScope(
  scope: GeneralBookingDraftScope,
  request: BookingConfirmationRequest,
): BookingDraftConversationScope {
  return { ...scope, conversationId: request.conversationId }
}
function iso(value: Date | null) {
  if (value === null) return null
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    refuseBookingConfirmation("unavailable")
  return value.toISOString()
}
/** Include every persisted column, with actual Date values made explicit. */
export function bookingConfirmationFingerprint(row: AssistantActionProposal) {
  assertCommerceQuoteReviewBudget(row)
  return proposalDigest({
    ...row,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    expiresAt: iso(row.expiresAt),
    decidedAt: iso(row.decidedAt),
  })
}
export function assertBookingConfirmationReadback(
  before: AssistantActionProposal,
  after: AssistantActionProposal,
  change: Partial<AssistantActionProposal>,
) {
  if (
    bookingConfirmationFingerprint({
      ...after,
      updatedAt: before.updatedAt,
    }) !== bookingConfirmationFingerprint({ ...before, ...change })
  )
    refuseBookingConfirmation("saved_result_unavailable")
}
export function bookingConfirmationCAS(
  scope: BookingDraftConversationScope,
  row: AssistantActionProposal,
): Prisma.AssistantActionProposalWhereInput {
  return {
    ...bookingDraftWhere(scope, row.id),
    status: row.status,
    action: row.action,
    actionVersion: row.actionVersion,
    revision: row.revision,
    payload: {
      equals: row.payload === null ? PrismaValues.AnyNull : row.payload,
    },
    payloadHash: row.payloadHash,
    idempotencyKey: row.idempotencyKey,
    roleSnapshot: row.roleSnapshot,
    targetRecordId: row.targetRecordId,
    targetRevision: row.targetRevision,
    approvalTokenHash: row.approvalTokenHash,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Prisma reads both database NULL and JSON null as null. Either has no saved outcome;
    // a non-null outcome is bound in full, never just by receipt family.
    executedResult: {
      equals:
        row.executedResult === null ? PrismaValues.AnyNull : row.executedResult,
    },
    errorCode: row.errorCode,
    decidedAt: row.decidedAt,
  }
}
export function assertBookingConfirmationApproval(
  row: AssistantActionProposal,
  request: BookingConfirmationRequest,
  key: string,
) {
  if (row.expiresAt.getTime() <= Date.now())
    refuseBookingConfirmation("approval_unavailable")
  let expected: string
  try {
    expected = generalBookingDraftApprovalToken(row, key)
  } catch {
    return refuseBookingConfirmation("approval_unavailable")
  }
  const wanted = Buffer.from(expected)
  const supplied = Buffer.from(request.approvalToken ?? "")
  if (
    proposalDigest(expected) !== row.approvalTokenHash ||
    wanted.length !== supplied.length ||
    !timingSafeEqual(wanted, supplied)
  )
    refuseBookingConfirmation("approval_unavailable")
}
export function bookingConfirmationReceipt(
  effect: unknown,
): BookingConfirmationReceipt {
  const parsed = generalBookingReceiptSchema.safeParse({
    kind: "service_booking_command",
    effect,
  })
  if (!parsed.success) refuseBookingConfirmation("saved_result_unavailable")
  return parsed.data
}
export function sameBookingConfirmationReceipt(
  saved: unknown,
  receipt: BookingConfirmationReceipt,
) {
  const parsed = generalBookingReceiptSchema.safeParse(saved)
  return (
    parsed.success &&
    proposalDigest(parsed.data) === proposalDigest(receipt) &&
    proposalDigest(saved) === proposalDigest(receipt)
  )
}
