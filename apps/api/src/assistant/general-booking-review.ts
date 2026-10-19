import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  GeneralBookingDraftStoreError,
  bookingDraftIdentity,
  bookingDraftSigningKey,
  generalBookingDraftApprovalToken,
} from "./general-booking-draft-contract"
import { readGeneralBookingAppReviewInTransaction } from "./general-booking-review-projection"
import {
  type BookingReviewTransportPacket,
  type BookingReviewTransportScope,
  beginGeneralBookingReviewTransport,
  completeGeneralBookingReviewTransport,
  createGeneralBookingReviewTransportPacket,
  readGeneralBookingReviewTransportPage,
} from "./general-booking-review-transport"
import { bookingReviewRefSchema } from "./general-booking-review-transport-checkpoint"
import {
  BookingReviewTransportError,
  bookingReviewDataSnapshot,
} from "./general-booking-review-transport-data"
import { bookingReviewEnvelopeFits } from "./general-booking-review-transport-envelope"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"
import { proposalDigest } from "./proposal-security"

export const BOOKING_REVIEW_REQUEST_MAX_BYTES = 8192
const base = z
  .object({
    conversationId: z.string().min(1).max(128),
    draftRef: bookingDraftIdentity,
    revision: z.number().int().min(1).max(2_147_483_647),
  })
  .strict()
const checkpoint = z.string().min(1).max(2048)
export const generalBookingReviewBeginInputSchema = base
export const generalBookingReviewPageInputSchema = base
  .extend({
    reviewRef: bookingReviewRefSchema,
    index: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    checkpoint,
  })
  .strict()
export const generalBookingReviewCompleteInputSchema = base
  .extend({
    reviewRef: bookingReviewRefSchema,
    finalCheckpoint: checkpoint,
    acknowledged: z.literal(true),
  })
  .strict()
const message = "This complete booking review is unavailable. Review it again."
function fail(
  code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" = "CONFLICT",
): never {
  throw new TRPCError({ code, message })
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  try {
    const snapshot = bookingReviewDataSnapshot(
      { json: raw },
      BOOKING_REVIEW_REQUEST_MAX_BYTES,
    )
    const envelope = z.object({ json: schema }).strict().safeParse(snapshot)
    if (envelope.success) return envelope.data.json
  } catch (error) {
    if (!(error instanceof BookingReviewTransportError)) throw error
  }
  fail("BAD_REQUEST")
}
type Base = z.infer<typeof base>
type Complete = Extract<
  Awaited<ReturnType<typeof readGeneralBookingAppReviewInTransaction>>,
  { kind: "complete" }
>
type Current = {
  packet: BookingReviewTransportPacket
  scope: BookingReviewTransportScope
  key: string
  source: Complete
}
function stillCurrent(key: string, expiresAt: string) {
  if (
    process.env.ASSISTANT_APPROVAL_SIGNING_KEY !== key ||
    Date.parse(expiresAt) <= Date.now()
  )
    fail()
}
async function fresh<T>(
  ctx: GeneralContext,
  input: Base,
  operation: (current: Current) => T,
): Promise<T> {
  try {
    const result = await inFreshGeneralTransaction(ctx, async (current) => {
      const auth = requireGeneralScope(current)
      if (
        current.assistantConversationId !== undefined &&
        current.assistantConversationId !== input.conversationId
      )
        throw new TRPCError({ code: "FORBIDDEN", message })
      const scope = {
        actorUserId: auth.userId,
        tenantId: auth.tenantId,
        storeId: auth.storeId,
        conversationId: input.conversationId,
      }
      const key = bookingDraftSigningKey(
        process.env.ASSISTANT_APPROVAL_SIGNING_KEY,
      )
      const source = await readGeneralBookingAppReviewInTransaction(
        current.db,
        { ...scope, draftRef: input.draftRef },
        key,
      )
      if (source.kind !== "complete") fail("NOT_FOUND")
      if (source.review.draft.revision !== input.revision) fail()
      const packet = createGeneralBookingReviewTransportPacket(source)
      stillCurrent(key, source.review.draft.expiresAt)
      const response = operation({ packet, scope, key, source })
      if (!bookingReviewEnvelopeFits(response)) fail()
      stillCurrent(key, source.review.draft.expiresAt)
      // Server-only closure metadata is removed after the owning TX succeeds.
      return { response, key, expiresAt: source.review.draft.expiresAt }
    })
    stillCurrent(result.key, result.expiresAt)
    return result.response
  } catch (error) {
    if (
      error instanceof BookingReviewTransportError ||
      error instanceof GeneralBookingDraftStoreError
    )
      fail()
    // Actual fresh guard TRPC refusals and unexpected persistence faults retain
    // their established semantics; never mask a driver/programming failure.
    throw error
  }
}

/** UNREGISTERED authenticated-app composition. Each operation owns ONE actual
 * fresh GENERAL TX and ONE actual signed/full native review. The 8192-byte
 * parsed envelope admission is NOT raw HTTP/body/URL/batch admission. The caller
 * still owes actual app/client/action/rollout/CSRF/no-store route controls and
 * complete client assembly+acknowledgement. No model tool or endpoint is added.
 * Private row/target/packet handles never escape; no effects or dispatch occur.
 */
export async function beginGeneralBookingReview(
  ctx: GeneralContext,
  raw: unknown,
) {
  const input = parse(generalBookingReviewBeginInputSchema, raw)
  return fresh(ctx, input, ({ packet, scope, key }) =>
    beginGeneralBookingReviewTransport(packet, scope, key),
  )
}
export async function readGeneralBookingReviewPage(
  ctx: GeneralContext,
  raw: unknown,
) {
  const input = parse(generalBookingReviewPageInputSchema, raw)
  return fresh(ctx, input, ({ packet, scope, key }) =>
    readGeneralBookingReviewTransportPage(
      packet,
      {
        reviewRef: input.reviewRef,
        index: input.index,
        checkpoint: input.checkpoint,
      },
      scope,
      key,
    ),
  )
}
/** Transport completion grants no human-reading proof and executes nothing.
 * Release only the existing exact localV1 token; later explicit Confirm still
 * calls actual fresh booking decision/review/CAS/effect/receipt composition.
 */
export async function completeGeneralBookingReview(
  ctx: GeneralContext,
  raw: unknown,
) {
  const input = parse(generalBookingReviewCompleteInputSchema, raw)
  return fresh(ctx, input, ({ packet, scope, key, source }) => {
    const checked = completeGeneralBookingReviewTransport(
      packet,
      {
        reviewRef: input.reviewRef,
        finalCheckpoint: input.finalCheckpoint,
        acknowledged: input.acknowledged,
      },
      scope,
      key,
    )
    const r = source.privateBinding.row
    const approvalToken = generalBookingDraftApprovalToken(
      {
        id: r.id,
        revision: r.revision,
        tenantId: r.tenantId,
        storeId: r.storeId,
        actorUserId: r.actorUserId,
        expiresAt: new Date(r.expiresAt),
        action: r.action,
        actionVersion: r.actionVersion,
        roleSnapshot: r.roleSnapshot,
        conversationId: r.conversationId,
        idempotencyKey: r.idempotencyKey,
        payloadHash: r.payloadHash,
        targetRecordId: r.targetRecordId,
        targetRevision: r.targetRevision,
      },
      key,
    )
    if (proposalDigest(approvalToken) !== r.approvalTokenHash) fail()
    stillCurrent(key, r.expiresAt)
    return {
      kind: "ready" as const,
      draftRef: checked.draftRef,
      revision: checked.revision,
      approvalToken,
      expiresAt: r.expiresAt,
    }
  })
}
