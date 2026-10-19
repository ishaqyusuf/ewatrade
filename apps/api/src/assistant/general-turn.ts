import { ASSISTANT_RUNTIME_CONFIGURATION_KEY } from "@ewatrade/ai/runtime-config"
import { WHATSAPP_ASSISTANT_PROMPT_VERSION } from "@ewatrade/assistant/channels/instructions"
import { generalStoredPartSchema } from "@ewatrade/assistant/general/contracts"
import { GENERAL_PROMPT_VERSION } from "@ewatrade/assistant/general/prompt"
import { generalReadContinuationContext } from "@ewatrade/assistant/general/read-continuation"
import { SETUP_ATTACHMENT_PART } from "@ewatrade/assistant/setup/attachments"
import {
  type AssistantStoredMessage,
  beginAssistantRunInTransaction,
  completeAssistantRun,
  listAssistantMessages,
  newAssistantMessageId,
  reserveAssistantBudget,
} from "@ewatrade/db/assistant"
import {
  listAssistantAttachments,
  readAssistantAttachmentsForConversation,
} from "@ewatrade/db/assistant-attachments"
import {
  readGeneralActiveRun,
  readGeneralConversation,
  readGeneralRun,
} from "@ewatrade/db/assistant-general"
import { stampAssistantWhatsAppExecution } from "@ewatrade/db/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import {
  type LanguageModelUsage,
  convertToModelMessages,
  createUIMessageStream,
} from "ai"
import { z } from "zod"
import { resolveProtectedTenantContext } from "../trpc/init"
import {
  isLinkedAssistantIdentity,
  lockLinkedAssistantIdentity,
} from "./channel-principal"
import {
  attachmentSendRefusal,
  referencedAttachmentIds,
  storedUserParts,
  withAttachmentText,
} from "./chat-attachments"
import {
  GENERAL_BUDGET_LIMITS,
  generalBudgetScopeKey,
} from "./general-allowance"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { generalPersistentParts } from "./general-persistence"
import {
  type GeneralTurn,
  type GeneralTurnCompletion,
  GeneralTurnError,
  type GeneralUIMessage,
  generalTurnInputSchema,
} from "./general-turn-contract"
import { executeGeneralTurn } from "./general-turn-execution"
import { resolveGeneralAssistantModel } from "./model-resolution"

/** One authorized GENERAL turn, independent of HTTP or WhatsApp delivery. */
export async function createGeneralAssistantTurn(
  context: GeneralContext,
  input: unknown,
  signal?: AbortSignal,
): Promise<GeneralTurn> {
  const parsed = generalTurnInputSchema.safeParse(input)
  if (!parsed.success)
    throw new GeneralTurnError(400, "BAD_REQUEST", "Invalid assistant message.")
  const body = parsed.data
  const ctx = isLinkedAssistantIdentity(context.session)
    ? await resolveProtectedTenantContext({ ...context, tenantContext: null })
    : context
  const scope = requireGeneralScope(ctx)
  const linked = isLinkedAssistantIdentity(ctx.session)
  if (linked && ctx.assistantConversationId !== body.conversationId)
    throw new GeneralTurnError(
      404,
      "NOT_FOUND",
      "Conversation unavailable in this Store.",
    )
  const conversation = await readGeneralConversation(
    ctx.db,
    scope,
    body.conversationId,
  )
  if (!conversation)
    throw new GeneralTurnError(
      404,
      "NOT_FOUND",
      "Conversation unavailable in this Store.",
    )
  const model = await resolveGeneralAssistantModel({
    dataClassification: scope.dataClassification,
    readRuntimeConfiguration: async () =>
      (
        await ctx.db.systemConfiguration.findUnique({
          where: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY },
          select: { value: true },
        })
      )?.value,
  })
  if (!model)
    throw new GeneralTurnError(
      503,
      "ASSISTANT_UNAVAILABLE",
      "The assistant is unavailable. Your saved answers and proposals are still here.",
    )
  const budgetScopeKey = generalBudgetScopeKey(scope)
  const textParts = body.message.parts.filter(
    (part): part is { type: "text"; text: string } => part.type === "text",
  )
  const attachmentIds = body.message.parts.flatMap((part) =>
    part.type === SETUP_ATTACHMENT_PART ? [part.data.attachmentId] : [],
  )
  const attachments = await listAssistantAttachments(
    ctx.db,
    scope,
    attachmentIds,
  )
  const refusal = attachmentSendRefusal(attachments, {
    conversationId: conversation.id,
    messageId: body.message.id,
    requested: attachmentIds,
  })
  if (refusal)
    throw new GeneralTurnError(
      409,
      refusal,
      refusal === "ATTACHMENT_NOT_READY"
        ? "Wait until every file has finished uploading, then send again."
        : "One of these files is not available. Attach it again.",
    )
  const begun = await ctx.db.$transaction(async (tx) => {
    if (isLinkedAssistantIdentity(ctx.session)) {
      const current = await lockLinkedAssistantIdentity(tx, ctx.session)
      if (ctx.session.inboxLease)
        await stampAssistantWhatsAppExecution(
          tx,
          ctx.session.inboxLease,
          current,
        )
    }
    await tx.$queryRaw`SELECT "id" FROM "AssistantConversation" WHERE "id" = ${conversation.id} FOR UPDATE`
    if (await readGeneralActiveRun(tx, scope, conversation.id))
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "A reply is already running. Check its status before sending again.",
      })
    return beginAssistantRunInTransaction(tx, {
      actorUserId: scope.userId,
      conversationId: conversation.id,
      model: model.modelId,
      promptVersion: linked
        ? `${GENERAL_PROMPT_VERSION}/${WHATSAPP_ASSISTANT_PROMPT_VERSION}`
        : GENERAL_PROMPT_VERSION,
      provider: model.provider,
      requestId: body.requestId,
      userMessage: {
        ...body.message,
        parts: storedUserParts(
          textParts,
          attachments,
          attachmentIds,
        ) as unknown as AssistantStoredMessage["parts"],
      },
      attachmentIds,
    })
  })
  if (begun.replay)
    throw new GeneralTurnError(
      409,
      "REQUEST_REPLAYED",
      "This message was already sent. Refresh to see its reply.",
    )
  const budget = await reserveAssistantBudget(ctx.db, {
    scopeKey: budgetScopeKey,
    limits: GENERAL_BUDGET_LIMITS,
  })
  if (!budget.allowed) {
    await completeAssistantRun(ctx.db, {
      runId: begun.run.id,
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
      provider: model.provider,
      model: model.modelId,
      status: "FAILED",
      errorCode: "BUDGET_EXHAUSTED",
    })
    throw new GeneralTurnError(
      429,
      "BUDGET_EXHAUSTED",
      "This month's assistant allowance is used up. You can still review and confirm existing drafts.",
    )
  }
  const stored = await listAssistantMessages(ctx.db, conversation.id, {
    limit: 40,
  })
  // Only saved text goes back into the model. App-issued approvals are never history.
  const savedMessageSchema = z.object({
    id: z.string(),
    role: z.enum(["assistant", "user", "system"]),
    parts: z.array(generalStoredPartSchema),
  })
  // Attachments reach the model only as delimited, untrusted text.
  const sentAttachments = await readAssistantAttachmentsForConversation(
    ctx.db,
    {
      conversationId: conversation.id,
      attachmentIds: referencedAttachmentIds(
        stored as unknown as Parameters<typeof referencedAttachmentIds>[0],
      ),
    },
  )
  const readable = withAttachmentText(
    stored as unknown as Parameters<typeof withAttachmentText>[0],
    sentAttachments,
    { attachmentOnlyImages: true },
  ) as unknown as typeof stored
  const history: GeneralUIMessage[] = readable.flatMap((message) => {
    const parsed = savedMessageSchema.safeParse({
      ...message,
      parts: Array.isArray(message.parts)
        ? message.parts.filter(
            (part) =>
              part &&
              typeof part === "object" &&
              "type" in part &&
              (part.type === "text" || part.type === "data-general-answer"),
          )
        : [],
    })
    return parsed.success ? [parsed.data] : []
  })
  const readContext = generalReadContinuationContext(history)
  const lastAssistantIndex = history.findLastIndex(
    (message) => message.role === "assistant",
  )
  const messages = await convertToModelMessages(
    history.map(({ role, parts }, index) => ({
      role,
      parts: [
        ...parts.filter((part) => part.type === "text"),
        ...(readContext && index === lastAssistantIndex
          ? [{ type: "text" as const, text: readContext }]
          : []),
      ],
    })),
  )

  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), 45_000)
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener("abort", abort, { once: true })
  const startedAt = Date.now()
  let failed = false
  const usages: LanguageModelUsage[] = []
  let steps = 0
  let settle: (result: GeneralTurnCompletion) => void = () => {}
  const completion = new Promise<GeneralTurnCompletion>((resolve) => {
    settle = resolve
  })
  const stream = createUIMessageStream<GeneralUIMessage>({
    originalMessages: history,
    generateId: newAssistantMessageId,
    execute: ({ writer }) =>
      executeGeneralTurn({
        ctx,
        body,
        model,
        conversationId: conversation.id,
        runId: begun.run.id,
        budget,
        textParts,
        attachments,
        stored,
        messages,
        writer,
        signal: controller.signal,
        onUsage: (usage, count) => {
          usages.push(usage)
          steps += count
        },
      }),
    onError: () => {
      failed = true
      return "Reply interrupted. Your saved answers and drafts are safe. Check reply status before retrying."
    },
    onFinish: async ({ responseMessage, isAborted }) => {
      clearTimeout(deadline)
      signal?.removeEventListener("abort", abort)
      const parts = generalPersistentParts(responseMessage.parts)
      try {
        await completeAssistantRun(ctx.db, {
          runId: begun.run.id,
          tenantId: scope.tenantId,
          actorUserId: scope.userId,
          provider: model.provider,
          model: model.modelId,
          status: failed || isAborted ? "FAILED" : "COMPLETED",
          errorCode: failed
            ? "STREAM_FAILED"
            : isAborted
              ? "ABORTED"
              : undefined,
          usage: usages.length
            ? {
                inputTokens: sumUsage(usages, (u) => u.inputTokens),
                outputTokens: sumUsage(usages, (u) => u.outputTokens),
                cachedInputTokens: sumUsage(
                  usages,
                  (u) => u.inputTokenDetails?.cacheReadTokens,
                ),
                totalTokens: sumUsage(usages, (u) => u.totalTokens),
              }
            : undefined,
          stepCount: steps,
          durationMs: Date.now() - startedAt,
          budgetScopeKey,
          assistantMessage: parts.length
            ? {
                id: responseMessage.id,
                role: "assistant",
                parts: parts as unknown as AssistantStoredMessage["parts"],
              }
            : undefined,
        })
        const saved = await readGeneralRun(ctx.db, scope, begun.run.id)
        const message = parts.length
          ? await ctx.db.assistantMessage.findFirst({
              where: {
                id: responseMessage.id,
                conversationId: conversation.id,
                role: "assistant",
                conversation: {
                  ownerUserId: scope.userId,
                  tenantId: scope.tenantId,
                  storeId: scope.storeId,
                },
              },
              select: { id: true },
            })
          : null
        settle({
          runId: begun.run.id,
          status: saved?.status === "COMPLETED" ? "COMPLETED" : "FAILED",
          persisted: Boolean(
            saved && saved.status !== "RUNNING" && (!parts.length || message),
          ),
          assistantMessageId: message?.id ?? null,
          ...(saved?.errorCode ? { errorCode: saved.errorCode } : {}),
        })
      } catch (error) {
        console.error("[assistant] General run finalization failed", {
          runId: begun.run.id,
          name: error instanceof Error ? error.name : "unknown",
        })
        settle({
          runId: begun.run.id,
          status: "FAILED",
          persisted: false,
          assistantMessageId: null,
          errorCode: "FINALIZATION_FAILED",
        })
      }
    },
  })
  return { runId: begun.run.id, stream, completion }
}

/** Undefined when no pass reported the figure. */
function sumUsage(
  usages: LanguageModelUsage[],
  pick: (usage: LanguageModelUsage) => number | undefined,
) {
  const values = usages
    .map(pick)
    .filter((value): value is number => value !== undefined)
  return values.length ? values.reduce((a, b) => a + b, 0) : undefined
}
