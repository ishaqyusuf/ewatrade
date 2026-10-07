import {
  type SetupOpenQuestion,
  deriveSetupEntityState,
  sanitizeVocabulary,
  setupEntityKind,
  setupEntityPayloadSchema,
  setupOpenQuestionSchema,
} from "@ewatrade/assistant/setup/contracts"
import { summarizeSetupFollowUp } from "@ewatrade/assistant/setup/follow-up"
import {
  setupBeginMessage,
  setupCommitSummaryMessage,
  setupGreetingMessages,
  setupResumeMessage,
} from "@ewatrade/assistant/setup/messages"
import {
  appendAssistantMessage,
  createSetupConversation,
  findSetupConversation,
  listAssistantMessages,
  newAssistantMessageId,
  readSetupDraft,
  removeSetupDraftEntities,
  setAssistantConversationStatus,
  setSetupDraftEntityStates,
  upsertSetupDraftEntities,
} from "@ewatrade/db/assistant"
import { listSentAssistantAttachments } from "@ewatrade/db/assistant-attachments"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  commitSetupDraft,
  describeCommitError,
  isOpeningBalancePending,
} from "../../assistant/setup-commit"
import {
  isSetupAssistantEnabled,
  loadSetupBusinessContext,
  requireSetupAssistantScope,
} from "../../assistant/setup-context"
import { readSetupPrerequisites } from "../../assistant/setup-prerequisites"
import { createTRPCRouter, protectedProcedure } from "../init"
import { setupAssistantAttachmentsRouter } from "./setup-assistant-attachments"

const keysSchema = z.array(z.string().min(1).max(140)).min(1).max(200)
const conversationIdSchema = z.string().min(1).max(64)

/**
 * The setup belongs to the active Store. Writes name the conversation the owner
 * is looking at, so a Store switch in another tab (or a revoked role, checked by
 * the scope) refuses instead of acting on a different Store's setup list.
 */
export function assertSetupConversationCurrent(
  conversation: { id: string } | null | undefined,
  expectedConversationId: string,
) {
  if (conversation && conversation.id !== expectedConversationId)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Your active store changed. Switch back to the store you were setting up, or open this store's setup list.",
    })
}

async function requireDraft(
  db: Parameters<typeof findSetupConversation>[0],
  scope: Parameters<typeof findSetupConversation>[1],
  expectedConversationId?: string,
) {
  const conversation = await findSetupConversation(db, scope)
  if (expectedConversationId)
    assertSetupConversationCurrent(conversation, expectedConversationId)
  if (!conversation?.setupDraft)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Start the setup assistant first.",
    })
  return { conversation, draftId: conversation.setupDraft.id }
}

type DraftEntities = Awaited<ReturnType<typeof readSetupDraft>>["entities"]

/** What the owner still has to finish, for the launchpad and follow-up copy. */
function setupFollowUpState(entities: DraftEntities) {
  const committed = entities.filter((entity) => entity.state === "COMMITTED")
  return {
    ...summarizeSetupFollowUp(entities),
    committed: committed.length,
    balancesPending: committed.filter((entity) =>
      isOpeningBalancePending(entity.errorCode),
    ).length,
  }
}

export const setupAssistantRouter = createTRPCRouter({
  attachments: setupAssistantAttachmentsRouter,

  state: protectedProcedure.query(async ({ ctx }) => {
    const role = ctx.tenantContext.membership.role
    if (
      !isSetupAssistantEnabled() ||
      !["OWNER", "ADMIN"].includes(role) ||
      !ctx.tenantContext.activeStore
    )
      return { enabled: false as const }
    const scope = requireSetupAssistantScope(ctx)
    const conversation = await findSetupConversation(ctx.db, scope)
    if (!conversation?.setupDraft)
      return {
        enabled: true as const,
        conversation: null,
        messages: [],
        draft: null,
        currencyCode: ctx.tenantContext.activeStore.currencyCode,
        prerequisites: { termsRequired: false, financeBookMissing: false },
        followUp: setupFollowUpState([]),
        attachments: [],
      }
    const [messages, draft, attachments] = await Promise.all([
      listAssistantMessages(ctx.db, conversation.id),
      readSetupDraft(ctx.db, conversation.setupDraft.id),
      listSentAssistantAttachments(ctx.db, conversation.id),
    ])
    const prerequisites = await readSetupPrerequisites(
      ctx.db,
      {
        userId: scope.userId,
        tenantId: scope.tenantId,
        currencyCode: ctx.tenantContext.tenant.currencyCode,
      },
      draft.entities,
    )
    return {
      enabled: true as const,
      conversation: {
        id: conversation.id,
        status: conversation.status,
      },
      messages: messages.map(({ id, role, parts }) => ({ id, role, parts })),
      draft,
      currencyCode: ctx.tenantContext.activeStore.currencyCode,
      prerequisites,
      followUp: setupFollowUpState(draft.entities),
      attachments,
    }
  }),

  start: protectedProcedure.mutation(async ({ ctx }) => {
    const scope = requireSetupAssistantScope(ctx)
    const existing = await findSetupConversation(ctx.db, scope)
    if (existing) return { conversationId: existing.id }
    const { context, firstName } = await loadSetupBusinessContext(ctx.db, scope)
    const conversation = await createSetupConversation(
      ctx.db,
      scope,
      setupGreetingMessages({
        businessName: context.businessName,
        firstName,
        businessType: context.businessProfile?.title ?? null,
      }).map((message) => ({ ...message, id: newAssistantMessageId() })),
    )
    return { conversationId: conversation.id }
  }),

  begin: protectedProcedure.mutation(async ({ ctx }) => {
    const scope = requireSetupAssistantScope(ctx)
    const { conversation, draftId } = await requireDraft(ctx.db, scope)
    if (conversation.status === "ACTIVE") return { status: "ACTIVE" as const }
    const resuming =
      conversation.status === "SKIPPED" || conversation.status === "COMPLETED"
    const followUp = resuming
      ? summarizeSetupFollowUp((await readSetupDraft(ctx.db, draftId)).entities)
      : undefined
    const changed = await setAssistantConversationStatus(ctx.db, {
      conversationId: conversation.id,
      from: ["OFFERED", "SKIPPED", "COMPLETED"],
      to: "ACTIVE",
      appendMessages: [
        {
          ...(resuming ? setupResumeMessage(followUp) : setupBeginMessage()),
          id: newAssistantMessageId(),
        },
      ],
    })
    if (!changed)
      throw new TRPCError({
        code: "CONFLICT",
        message: "This setup conversation has already finished.",
      })
    return { status: "ACTIVE" as const }
  }),

  skip: protectedProcedure.mutation(async ({ ctx }) => {
    const scope = requireSetupAssistantScope(ctx)
    const { conversation } = await requireDraft(ctx.db, scope)
    await setAssistantConversationStatus(ctx.db, {
      conversationId: conversation.id,
      from: ["OFFERED", "ACTIVE"],
      to: "SKIPPED",
    })
    return { status: "SKIPPED" as const }
  }),

  /** "Done for now" after records were added; the launchpad offers to continue. */
  finish: protectedProcedure.mutation(async ({ ctx }) => {
    const scope = requireSetupAssistantScope(ctx)
    const { conversation } = await requireDraft(ctx.db, scope)
    await setAssistantConversationStatus(ctx.db, {
      conversationId: conversation.id,
      from: ["ACTIVE"],
      to: "COMPLETED",
    })
    return { status: "COMPLETED" as const }
  }),

  updateEntity: protectedProcedure
    .input(
      z.object({
        conversationId: conversationIdSchema,
        key: z.string().min(1).max(140),
        payload: setupEntityPayloadSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const { draftId } = await requireDraft(
        ctx.db,
        scope,
        input.conversationId,
      )
      const draft = await readSetupDraft(ctx.db, draftId)
      const current = draft.entities.find((entity) => entity.key === input.key)
      if (!current)
        throw new TRPCError({ code: "NOT_FOUND", message: "Record not found." })
      if (current.state === "COMMITTED")
        throw new TRPCError({
          code: "CONFLICT",
          message: "This record was already added to your business.",
        })
      if (setupEntityKind(input.payload) !== current.kind)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A record cannot change type.",
        })
      const { payload } = sanitizeVocabulary(input.payload)
      const previous = z
        .array(setupOpenQuestionSchema)
        .catch([])
        .parse(current.openQuestions)
      const derived = deriveSetupEntityState(
        payload,
        previous.filter((question: SetupOpenQuestion) => !question.required),
      )
      return upsertSetupDraftEntities(ctx.db, {
        draftId,
        entities: [
          {
            key: input.key,
            kind: current.kind,
            state: derived.state,
            payload,
            source: (current.source ?? null) as never,
            openQuestions: derived.questions,
          },
        ],
      })
    }),

  setEntityState: protectedProcedure
    .input(
      z.object({
        conversationId: conversationIdSchema,
        keys: keysSchema,
        state: z.enum(["CONFIRMED", "PROPOSED", "SKIPPED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const { draftId } = await requireDraft(
        ctx.db,
        scope,
        input.conversationId,
      )
      if (input.state !== "PROPOSED")
        return setSetupDraftEntityStates(ctx.db, {
          draftId,
          keys: input.keys,
          state: input.state,
        })
      // Reopening recomputes readiness so a record missing a price stays unconfirmable.
      const draft = await readSetupDraft(ctx.db, draftId)
      const groups = { NEEDS_INPUT: [] as string[], PROPOSED: [] as string[] }
      for (const entity of draft.entities) {
        if (!input.keys.includes(entity.key)) continue
        const payload = setupEntityPayloadSchema.safeParse(entity.payload)
        if (!payload.success) continue
        groups[deriveSetupEntityState(payload.data, []).state].push(entity.key)
      }
      let result = { revision: draft.revision, updated: 0 }
      for (const [state, keys] of Object.entries(groups) as Array<
        ["NEEDS_INPUT" | "PROPOSED", string[]]
      >) {
        if (keys.length === 0) continue
        const next = await setSetupDraftEntityStates(ctx.db, {
          draftId,
          keys,
          state,
        })
        result = {
          revision: next.revision,
          updated: result.updated + next.updated,
        }
      }
      return result
    }),

  removeEntities: protectedProcedure
    .input(z.object({ conversationId: conversationIdSchema, keys: keysSchema }))
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const { draftId } = await requireDraft(
        ctx.db,
        scope,
        input.conversationId,
      )
      return removeSetupDraftEntities(ctx.db, { draftId, keys: input.keys })
    }),

  /** Adds confirmed records to the business in bounded batches; call until remaining is 0. */
  commit: protectedProcedure
    .input(z.object({ conversationId: conversationIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const { conversation, draftId } = await requireDraft(
        ctx.db,
        scope,
        input.conversationId,
      )
      if (conversation.status !== "ACTIVE")
        throw new TRPCError({
          code: "CONFLICT",
          message: "Resume the setup assistant before adding records.",
        })
      const outcome = await commitSetupDraft(
        ctx.db,
        { ...scope, conversationId: conversation.id },
        draftId,
      ).catch((error: unknown) => {
        console.error("[setup-commit] batch failed", {
          requestId: ctx.requestId,
          ...describeCommitError(error),
        })
        throw error
      })
      if (
        !outcome.interrupted &&
        outcome.remaining === 0 &&
        outcome.results.length > 0
      ) {
        const draft = await readSetupDraft(ctx.db, draftId)
        const committed = draft.entities.filter(
          (entity) => entity.state === "COMMITTED",
        )
        await appendAssistantMessage(ctx.db, {
          conversationId: conversation.id,
          message: {
            ...setupCommitSummaryMessage({
              products: committed.filter((entity) => entity.kind === "PRODUCT")
                .length,
              services: committed.filter((entity) => entity.kind === "SERVICE")
                .length,
              customers: committed.filter(
                (entity) => entity.kind === "CUSTOMER",
              ).length,
              balancesPending: committed.filter((entity) =>
                isOpeningBalancePending(entity.errorCode),
              ).length,
              failed: draft.entities.filter(
                (entity) => entity.state === "FAILED",
              ).length,
              followUp: summarizeSetupFollowUp(draft.entities),
            }),
            id: newAssistantMessageId(),
          },
        })
      }
      return outcome
    }),
})
