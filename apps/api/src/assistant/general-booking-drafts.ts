import { generalBookingActionSchema } from "@ewatrade/assistant/general/booking-action"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  BOOKING_DRAFT_MAX_REVISION,
  GeneralBookingDraftStoreError,
  bookingDraftIdentity,
  bookingDraftSigningKey,
  bookingDraftSnapshot,
} from "./general-booking-draft-contract"
import {
  createGeneralBookingDraftInTransaction,
  editGeneralBookingDraftInTransaction,
  readGeneralBookingDraftInTransaction,
} from "./general-booking-draft-store"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"

const conversationId = z.string().min(1).max(128)
export const generalBookingDraftCreateInputSchema = z
  .object({ conversationId, payload: generalBookingActionSchema })
  .strict()
export const generalBookingDraftReadInputSchema = z
  .object({ conversationId, draftRef: bookingDraftIdentity })
  .strict()
export const generalBookingDraftEditInputSchema = z
  .object({
    conversationId,
    draftRef: bookingDraftIdentity,
    revision: z.number().int().min(1).max(BOOKING_DRAFT_MAX_REVISION),
    payload: generalBookingActionSchema,
  })
  .strict()
const serverIdsSchema = z
  .object({
    proposalId: bookingDraftIdentity,
    idempotencyKey: bookingDraftIdentity,
  })
  .strict()

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  try {
    const result = schema.safeParse(bookingDraftSnapshot(raw))
    if (result.success) return result.data
  } catch (error) {
    if (!(error instanceof GeneralBookingDraftStoreError)) throw error
  }
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Review the exact booking draft again.",
  })
}

async function withFreshBookingDraft<T>(
  ctx: GeneralContext,
  conversation: string,
  operation: (
    tx: Parameters<typeof createGeneralBookingDraftInTransaction>[0],
    scope: {
      actorUserId: string
      tenantId: string
      storeId: string
      conversationId: string
    },
    signingKey: string,
  ) => Promise<T>,
) {
  try {
    return await inFreshGeneralTransaction(ctx, (fresh) => {
      const scope = requireGeneralScope(fresh)
      if (
        fresh.assistantConversationId !== undefined &&
        fresh.assistantConversationId !== conversation
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This booking draft is unavailable.",
        })
      return operation(
        fresh.db,
        {
          actorUserId: scope.userId,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          conversationId: conversation,
        },
        bookingDraftSigningKey(process.env.ASSISTANT_APPROVAL_SIGNING_KEY),
      )
    })
  } catch (error) {
    if (error instanceof GeneralBookingDraftStoreError)
      throw new TRPCError({
        code:
          error.reason === "unavailable" ||
          error.reason === "signing_unavailable"
            ? "NOT_FOUND"
            : "CONFLICT",
        message: "This booking draft is unavailable. Review it again.",
      })
    throw error
  }
}

/** UNREGISTERED server staging boundary. The authenticated request owner must
 * allocate and retain these two identities before transaction retries or lost
 * response reconciliation; never take them from editable app/model payloads.
 * This helper snapshots identities and input before its first await, then joins
 * the actual fresh GENERAL Session/account/legal/Store guard and full native
 * review in ONE transaction. It performs no native booking effect/preparation.
 * A public caller still owes capability/client/rollout and bounded raw-byte
 * admission plus durable request-to-allocation binding. No route/tool is added.
 */
export async function createGeneralBookingDraft(
  ctx: GeneralContext,
  raw: unknown,
  serverIds: { proposalId: string; idempotencyKey: string },
) {
  const input = parse(generalBookingDraftCreateInputSchema, raw)
  const allocation = parse(serverIdsSchema, serverIds)
  return withFreshBookingDraft(ctx, input.conversationId, (tx, scope, key) =>
    createGeneralBookingDraftInTransaction(
      tx,
      { ...scope, payload: input.payload },
      allocation,
      key,
    ),
  )
}

/** SERVER ONLY: returns the complete private saved row/native review. Never
 * expose as a router/model/history response. Full safe review projection and
 * authenticated bounded pagination remain separate integration work.
 */
export async function readGeneralBookingDraft(
  ctx: GeneralContext,
  raw: unknown,
) {
  const input = parse(generalBookingDraftReadInputSchema, raw)
  return withFreshBookingDraft(ctx, input.conversationId, (tx, scope, key) =>
    readGeneralBookingDraftInTransaction(
      tx,
      { ...scope, draftRef: input.draftRef },
      key,
    ),
  )
}

/** Compact staging response only; edits require a fresh exact full native review.
 * Human confirmation remains a separate operation after the transaction ends.
 */
export async function editGeneralBookingDraft(
  ctx: GeneralContext,
  raw: unknown,
) {
  const input = parse(generalBookingDraftEditInputSchema, raw)
  return withFreshBookingDraft(ctx, input.conversationId, (tx, scope, key) =>
    editGeneralBookingDraftInTransaction(
      tx,
      {
        ...scope,
        request: {
          draftRef: input.draftRef,
          revision: input.revision,
          payload: input.payload,
        },
      },
      key,
    ),
  )
}
