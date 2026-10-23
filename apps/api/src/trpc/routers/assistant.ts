import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { simpleSaleAction } from "@ewatrade/assistant/general/contracts"
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
import { assertGeneralAction } from "../../assistant/general-context"
import {
  requireGeneralScope,
  supportsGeneralCapability,
} from "../../assistant/general-context"
import { projectGeneralProposalHistory } from "../../assistant/general-proposal-history"
import {
  decideGeneralProposal,
  editGeneralProposal,
  generalProposalWithReview,
} from "../../assistant/general-proposals"
import { simpleExpenseOptions } from "../../assistant/general-simple-expense"
import { simpleSaleOptions } from "../../assistant/general-simple-sale"
import { simpleTransferOptions } from "../../assistant/general-simple-transfer"
import { assistantMediaAvailability } from "../../assistant/media-availability"
import {
  decideAssistantReviewLink,
  editAssistantReviewLink,
  readAssistantReviewLink,
} from "../../assistant/review-links"
import { createTRPCRouter, protectedProcedure } from "../init"
const id = z.string().min(1).max(128)
export const assistantRouter = createTRPCRouter({
  // Locator resolves through POST, keeping it out of tRPC query URLs and access logs.
  reviewLink: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(2048) }).strict())
    .mutation(({ ctx, input }) => readAssistantReviewLink(ctx, input.token)),
  decideReviewLink: protectedProcedure
    .input(
      z
        .object({
          token: z.string().min(1).max(2048),
          decision: z.enum(["confirm", "cancel"]),
          approvalToken: z.string().max(128).optional(),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) => decideAssistantReviewLink(ctx, input)),
  editReviewLink: protectedProcedure
    .input(
      z
        .object({
          token: z.string().min(1).max(2048),
          payload: generalActionSchema,
        })
        .strict(),
    )
    .mutation(({ ctx, input }) => editAssistantReviewLink(ctx, input)),
  simpleTransferOptions: protectedProcedure
    .input(z.object({}).strict())
    .query(async ({ ctx }) => {
      assertGeneralAction(ctx, "money_transfer_simple")
      return simpleTransferOptions(ctx)
    }),
  simpleExpenseOptions: protectedProcedure
    .input(z.object({}).strict())
    .query(async ({ ctx }) => {
      assertGeneralAction(ctx, "expense_record_simple")
      return simpleExpenseOptions(ctx)
    }),
  saleOptions: protectedProcedure
    .input(
      z
        .object({ customerName: z.string().trim().max(160).optional() })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      assertGeneralAction(ctx, "sale_record")
      const options = await simpleSaleOptions(
        ctx,
        simpleSaleAction.parse({
          action: "sale_record",
          customerName: input.customerName || undefined,
        }),
      )
      return {
        accounts: options.accounts.filter(
          (account) =>
            !account.paused &&
            account.paymentMethods.some(
              (method) => method === "cash" || method === "bank_transfer",
            ),
        ),
        customers: options.customers,
      }
    }),
  availability: protectedProcedure.query(({ ctx }) => {
    const media = assistantMediaAvailability(
      ctx.tenantContext.tenant.dataClassification,
      process.env,
      undefined,
      true,
    )
    // Installed apps read mediaEnabled and offer photos with it.
    const availability = {
      ...generalAssistantAvailability(process.env),
      mediaEnabled: media.photos,
      media,
    }
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
      const history = await projectGeneralProposalHistory(proposals, {
        supports: (capability) => supportsGeneralCapability(ctx, capability),
        read: (proposal) => generalProposalWithReview(ctx, proposal),
      })
      return {
        conversation,
        messages,
        ...history,
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
