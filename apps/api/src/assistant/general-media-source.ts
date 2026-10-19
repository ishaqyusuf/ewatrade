import {
  AssistantGeneralMediaSourceError,
  readAssistantGeneralMediaSourceInTransaction,
} from "@ewatrade/db/assistant-general-media-source"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"

const partIndex = z.number().int().min(0).max(7)
export const generalMediaSourceReadInputSchema = z
  .object({
    conversationId: z.string().min(1).max(128),
    messageId: z.string().min(1).max(80),
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("message"), partIndex }).strict(),
      z
        .object({
          kind: z.literal("attachment"),
          partIndex,
          attachmentId: z.string().min(1).max(64),
        })
        .strict(),
    ]),
  })
  .strict()
export type GeneralMediaSourceReadInput = z.infer<
  typeof generalMediaSourceReadInputSchema
>

/** Protected app/internal original-source read. The returned text is private;
 * never register this entire snapshot as model output or analytics. No public
 * router/tool is registered here. Source matching is not human review/approval.
 * The existing fresh GENERAL wrapper owns actual Session/linked principal,
 * current Store, age/privacy/legal revalidation and one bounded Serializable TX.
 * A future HTTP entrypoint must separately admit bounded request bytes before
 * parsing JSON; this parsed-input helper is not a raw-body transport boundary.
 */
export async function readGeneralMediaSource(
  ctx: GeneralContext,
  raw: unknown,
) {
  const parsed = generalMediaSourceReadInputSchema.safeParse(raw)
  if (!parsed.success)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose the exact original assistant source.",
    })
  const input = structuredClone(parsed.data)
  try {
    return await inFreshGeneralTransaction(ctx, async (fresh) => {
      const scope = requireGeneralScope(fresh)
      if (
        fresh.assistantConversationId !== undefined &&
        fresh.assistantConversationId !== input.conversationId
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This original assistant source is unavailable.",
        })
      return readAssistantGeneralMediaSourceInTransaction(fresh.db, {
        ...input,
        scope: {
          userId: scope.userId,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
        },
      })
    })
  } catch (error) {
    if (error instanceof AssistantGeneralMediaSourceError)
      throw new TRPCError({
        code: error.code === "FORBIDDEN" ? "FORBIDDEN" : "NOT_FOUND",
        message: "This original assistant source is unavailable.",
      })
    throw error
  }
}
