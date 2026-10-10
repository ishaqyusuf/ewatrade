import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  generalActionSchema,
  generalActionSummary,
} from "@ewatrade/assistant/general/contracts"
import { listAssistantMessages } from "@ewatrade/db/assistant"
import {
  listGeneralConversations,
  readGeneralActiveRun,
  readGeneralConversation,
  readGeneralProposals,
  readPendingGeneralProposals,
  startGeneralConversation,
} from "@ewatrade/db/assistant-general"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { readGeneralAllowance } from "../../assistant/general-allowance"
import { generalAssistantAvailability } from "../../assistant/general-availability"
import {
  requireGeneralScope,
  supportsGeneralCapability,
} from "../../assistant/general-context"
import {
  decideGeneralProposal,
  editGeneralProposal,
  generalProposalWithReview,
} from "../../assistant/general-proposals"
import { createTRPCRouter, protectedProcedure } from "../init"
const id = z.string().min(1).max(128)
export const assistantRouter = createTRPCRouter({
  availability: protectedProcedure.query(({ ctx }) => {
    const availability = generalAssistantAvailability(process.env)
    if (!availability.enabled) return availability
    try {
      requireGeneralScope(ctx)
      return availability
    } catch {
      return { ...availability, enabled: false, reason: "no_access" as const }
    }
  }),
  conversations: protectedProcedure.query(({ ctx }) =>
    listGeneralConversations(ctx.db, requireGeneralScope(ctx)),
  ),
  start: protectedProcedure.mutation(({ ctx }) =>
    startGeneralConversation(ctx.db, requireGeneralScope(ctx)),
  ),
  allowance: protectedProcedure.query(({ ctx }) =>
    readGeneralAllowance(ctx.db, requireGeneralScope(ctx)),
  ),
  /** Drafts waiting for review across the user's chats, for the review rail. */
  pendingProposals: protectedProcedure.query(async ({ ctx }) => {
    const scope = requireGeneralScope(ctx)
    const currencyCode =
      ctx.tenantContext.activeStore?.currencyCode ??
      ctx.tenantContext.tenant.currencyCode
    const rows = await readPendingGeneralProposals(ctx.db, scope)
    return rows.flatMap((row) => {
      const parsed = generalActionSchema.safeParse(row.payload)
      if (!parsed.success) return []
      const capability = capabilityForAction(parsed.data.action)
      if (!supportsGeneralCapability(ctx, capability)) return []
      return [
        {
          id: row.id,
          conversationId: row.conversationId,
          conversationTitle: row.conversation.title,
          title: capability.title,
          summary: generalActionSummary(parsed.data, currencyCode).split(
            "\n",
          )[0],
          expiresAt: row.expiresAt.toISOString(),
        },
      ]
    })
  }),
  conversation: protectedProcedure
    .input(z.object({ conversationId: id }).strict())
    .query(async ({ ctx, input }) => {
      const scope = requireGeneralScope(ctx)
      const conversation = await readGeneralConversation(
        ctx.db,
        scope,
        input.conversationId,
      )
      if (!conversation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation unavailable in this Store.",
        })
      const messages = await listAssistantMessages(ctx.db, conversation.id, {
        limit: 40,
      })
      const proposals = await readGeneralProposals(
        ctx.db,
        scope,
        conversation.id,
      )
      const run = await readGeneralActiveRun(ctx.db, scope, conversation.id)
      return {
        conversation,
        messages,
        proposals: await Promise.all(
          proposals
            .filter((proposal) => {
              const payload = generalActionSchema.parse(proposal.payload)
              return supportsGeneralCapability(
                ctx,
                capabilityForAction(payload.action),
              )
            })
            .map((proposal) => generalProposalWithReview(ctx, proposal)),
        ),
        activeRunId: run?.id ?? null,
        allowance: await readGeneralAllowance(ctx.db, scope),
        businessName: ctx.tenantContext.tenant.name,
        storeName: ctx.tenantContext.activeStore?.name ?? "Store",
        currencyCode:
          ctx.tenantContext.activeStore?.currencyCode ??
          ctx.tenantContext.tenant.currencyCode,
      }
    }),
  decideProposal: protectedProcedure
    .input(
      z
        .object({
          proposalId: id,
          revision: z.number().int().positive(),
          decision: z.enum(["confirm", "cancel"]),
          approvalToken: z.string().max(128).optional(),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) => decideGeneralProposal(ctx, input)),
  editProposal: protectedProcedure
    .input(
      z
        .object({
          proposalId: id,
          revision: z.number().int().positive(),
          payload: generalActionSchema,
        })
        .strict(),
    )
    .mutation(({ ctx, input }) => editGeneralProposal(ctx, input)),
})
