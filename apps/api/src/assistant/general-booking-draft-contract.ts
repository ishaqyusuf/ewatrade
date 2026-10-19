import {
  type GeneralBookingAction,
  generalBookingActionSchema,
} from "@ewatrade/assistant/general/booking-action"
import type { AssistantActionProposal } from "@ewatrade/db/browser"
import { assertCommerceQuoteReviewBudget } from "@ewatrade/db/commerce-quote-review-budget"
import { z } from "zod"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"

export const BOOKING_DRAFT_MAX_REVISION = 2_147_483_647
export const bookingDraftIdentity = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value === value.trim())
const scopeId = bookingDraftIdentity
export const bookingDraftScopeSchema = z
  .object({
    actorUserId: scopeId,
    tenantId: scopeId,
    storeId: scopeId,
    // Match actual GENERAL turn/chat identity exactly; it is not a native token.
    conversationId: z.string().min(1).max(128),
  })
  .strict()
export type GeneralBookingDraftScope = Omit<
  z.infer<typeof bookingDraftScopeSchema>,
  "conversationId"
>
export type BookingDraftConversationScope = z.infer<
  typeof bookingDraftScopeSchema
>
export class GeneralBookingDraftStoreError extends Error {
  constructor(
    readonly reason:
      | "invalid_input"
      | "unavailable"
      | "invalid_binding"
      | "terminal"
      | "expired"
      | "stale_review"
      | "stale_draft"
      | "idempotency_conflict"
      | "signing_unavailable",
  ) {
    super(
      "This booking draft is unavailable. Keep its original identity and review it again.",
    )
    this.name = "GeneralBookingDraftStoreError"
  }
}
export function refuseBookingDraft(
  reason: GeneralBookingDraftStoreError["reason"],
): never {
  throw new GeneralBookingDraftStoreError(reason)
}
/** Parsed-data admission, not HTTP admission. Bound before copying/hash; unknown
 * callbacks/proxies are not invoked. Cloning drops hidden properties before Zod.
 */
export function bookingDraftSnapshot(raw: unknown): unknown {
  try {
    assertCommerceQuoteReviewBudget(raw)
    return structuredClone(raw)
  } catch {
    refuseBookingDraft("invalid_input")
  }
}
export function parseBookingDraftScope(
  raw: unknown,
): BookingDraftConversationScope {
  const result = bookingDraftScopeSchema.safeParse(bookingDraftSnapshot(raw))
  if (!result.success) refuseBookingDraft("invalid_input")
  return result.data
}
export function parseBookingDraftPayload(raw: unknown): GeneralBookingAction {
  const result = generalBookingActionSchema.safeParse(bookingDraftSnapshot(raw))
  if (!result.success) refuseBookingDraft("invalid_input")
  return result.data
}
export function bookingDraftOriginal(payload: GeneralBookingAction) {
  switch (payload.action) {
    case "service_booking_hold":
      return {
        action: payload.action,
        source: payload.source,
        offeringId: payload.offeringId,
      }
    case "service_booking_confirm":
      return {
        action: payload.action,
        source: payload.source,
        holdId: payload.holdId,
      }
    default:
      return { action: payload.action, bookingId: payload.bookingId }
  }
}
export function bookingDraftTargetId(payload: GeneralBookingAction) {
  if (payload.action === "service_booking_hold") return payload.source.id
  if (payload.action === "service_booking_confirm") return payload.holdId
  return payload.bookingId
}
export function bookingDraftSigningKey(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < 32)
    refuseBookingDraft("signing_unavailable")
  return raw
}
type SigningRow = Pick<
  AssistantActionProposal,
  | "id"
  | "revision"
  | "payloadHash"
  | "tenantId"
  | "storeId"
  | "actorUserId"
  | "expiresAt"
  | "action"
  | "actionVersion"
  | "targetRecordId"
  | "targetRevision"
  | "roleSnapshot"
  | "conversationId"
  | "idempotencyKey"
>
/** SERVER ONLY. Distinct V1 booking approval domain, not an ordinary GENERAL
 * approval token. No issuer/current authority/human acknowledgement is inferred.
 */
export function generalBookingDraftApprovalToken(
  row: SigningRow,
  secret: string,
) {
  const key = bookingDraftSigningKey(secret)
  assertCommerceQuoteReviewBudget(row)
  return proposalApprovalToken(
    {
      id: row.id,
      revision: row.revision,
      tenantId: row.tenantId,
      storeId: row.storeId,
      actorUserId: row.actorUserId,
      expiresAt: row.expiresAt,
      payloadHash: proposalDigest({
        domain: "GENERAL_BOOKING_DRAFT_V1",
        action: row.action,
        actionVersion: row.actionVersion,
        payloadHash: row.payloadHash,
        targetRecordId: row.targetRecordId,
        targetRevision: row.targetRevision,
        roleSnapshot: row.roleSnapshot,
        conversationId: row.conversationId,
        idempotencyKey: row.idempotencyKey,
      }),
    },
    key,
  )
}
