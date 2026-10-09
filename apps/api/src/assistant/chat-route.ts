import { ASSISTANT_RUNTIME_CONFIGURATION_KEY } from "@ewatrade/ai/runtime-config"
import {
  PRODUCT_ASSISTANT_PROMPT_VERSION,
  productAssistantInstructions,
  productWorkflowContextSchema,
} from "@ewatrade/assistant/product/contracts"
import {
  SETUP_ATTACHMENTS_PER_MESSAGE,
  SETUP_ATTACHMENT_PART,
} from "@ewatrade/assistant/setup/attachments"
import { SETUP_ASSISTANT_PROMPT_VERSION } from "@ewatrade/assistant/setup/contracts"
import type { SetupAssistantDataParts } from "@ewatrade/assistant/setup/messages"
import { buildSetupAssistantInstructions } from "@ewatrade/assistant/setup/prompt"
import { createSetupAssistantTools } from "@ewatrade/assistant/setup/tools"
import type { prisma } from "@ewatrade/db"
import {
  AssistantRecordError,
  type AssistantScope,
  type AssistantStoredMessage,
  assistantBudgetScopeKey,
  newAssistantMessageId,
} from "@ewatrade/db/assistant"
import { AssistantAttachmentError } from "@ewatrade/db/assistant-attachments"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import {
  type LanguageModelUsage,
  ToolLoopAgent,
  type UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
} from "ai"
import type { Context } from "hono"
import { z } from "zod"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import {
  attachmentSendRefusal,
  knownAttachments,
  referencedAttachmentIds,
  storedUserParts,
  withAttachmentText,
} from "./chat-attachments"
import {
  type AssistantChatRepository,
  createAssistantChatRepository,
} from "./chat-repository"
import {
  type ResolvedAssistantModel,
  resolveGeneralAssistantModel,
  resolveSetupAssistantModel,
} from "./model-resolution"
import {
  SETUP_BUDGET_LIMITS,
  SETUP_MEDIA_DISABLED,
  isSetupAssistantMediaEnabled,
  requireSetupAssistantScope,
} from "./setup-context"
import { AssistantLimitError, AssistantStreamGuard } from "./stream-guard"

export type SetupUIMessage = UIMessage<never, SetupAssistantDataParts>

const maxBodyBytes = 64 * 1024
const foregroundDeadlineMs = 45_000

const chatRequestSchema = z
  .object({
    conversationId: z.string().min(1).max(64),
    requestId: z.string().min(8).max(120),
    message: z.object({
      id: z.string().min(1).max(80),
      role: z.literal("user"),
      parts: z
        .array(
          z.union([
            z.object({
              type: z.literal("text"),
              text: z.string().min(1).max(8000),
            }),
            z.object({
              type: z.literal(SETUP_ATTACHMENT_PART),
              data: z.object({ attachmentId: z.string().min(1).max(64) }),
            }),
          ]),
        )
        .min(1)
        .max(4 + SETUP_ATTACHMENTS_PER_MESSAGE)
        .refine(
          (parts) =>
            parts.filter((part) => part.type === "text").length <= 4 &&
            parts.filter((part) => part.type !== "text").length <=
              SETUP_ATTACHMENTS_PER_MESSAGE,
        ),
    }),
  })
  .strict()

const ATTACHMENT_REFUSALS: Record<string, string> = {
  ATTACHMENT_NOT_FOUND: "One of these files is not available. Attach it again.",
  ATTACHMENT_NOT_READY: "Wait until every file has been read, then send again.",
  ATTACHMENT_ALREADY_SENT: "One of these files was already sent.",
}

type ChatScope = AssistantScope & { dataClassification: "LIVE" | "QA" }

/** Trusted server wiring; tests replace each piece, requests never select one. */
export type AssistantChatDependencies = {
  admit: (context: Context) => Promise<{
    scope: ChatScope
    repository: AssistantChatRepository
  }>
  resolveModel: (input: {
    scope: ChatScope
    repository: AssistantChatRepository
  }) => Promise<ResolvedAssistantModel | null>
  guard: AssistantStreamGuard
  /** Turns running in this process, so an explicit Stop can cancel one. */
  activeRuns: Map<string, AbortController>
}

export function defaultAssistantChatDependencies(): AssistantChatDependencies {
  return {
    admit: async (context) => {
      const ctx = await resolveProtectedTenantContext(
        await createTRPCContext(undefined, context),
      )
      const scope = requireSetupAssistantScope(ctx)
      return { scope, repository: createAssistantChatRepository(ctx.db, scope) }
    },
    resolveModel: ({ scope, repository }) =>
      resolveSetupAssistantModel({
        dataClassification: scope.dataClassification,
        readRuntimeConfiguration: repository.readRuntimeConfiguration,
      }),
    guard: new AssistantStreamGuard(),
    activeRuns: new Map(),
  }
}

/** Model for routes outside this setup chat, such as the gated general assistant. */
export function resolveModel(
  db: typeof prisma,
  dataClassification: "LIVE" | "QA",
  purpose: "SETUP" | "GENERAL" = "SETUP",
): Promise<ResolvedAssistantModel | null> {
  const readRuntimeConfiguration = async () =>
    (
      await db.systemConfiguration.findUnique({
        where: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY },
        select: { value: true },
      })
    )?.value
  return purpose === "GENERAL"
    ? resolveGeneralAssistantModel({
        dataClassification,
        readRuntimeConfiguration,
      })
    : resolveSetupAssistantModel({
        dataClassification,
        readRuntimeConfiguration,
      })
}

function failure(
  context: Context,
  status: number,
  code: string,
  message: string,
) {
  context.header("Cache-Control", "no-store")
  return context.json({ code, error: message }, status as 400)
}

async function admitOrRefuse(
  context: Context,
  deps: AssistantChatDependencies,
) {
  try {
    return { admitted: await deps.admit(context) }
  } catch (error) {
    if (error instanceof TRPCError)
      return {
        refusal: failure(
          context,
          getHTTPStatusCodeFromError(error),
          error.code,
          error.message,
        ),
      }
    throw error
  }
}

/** Only text, step and settled tool parts are kept in history. */
function persistableParts(message: SetupUIMessage) {
  return message.parts.filter(
    (part) =>
      part.type === "text" ||
      part.type === "step-start" ||
      (part.type.startsWith("tool-") &&
        "state" in part &&
        (part.state === "output-available" || part.state === "output-error")),
  )
}

function usageRecord(usage: LanguageModelUsage | undefined) {
  if (!usage) return undefined
  return {
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  }
}

async function handleChat(context: Context, deps: AssistantChatDependencies) {
  context.header("Cache-Control", "no-store")
  const admission = await admitOrRefuse(context, deps)
  if (!admission.admitted) return admission.refusal
  const { scope, repository } = admission.admitted

  const raw = await context.req.text()
  if (raw.length > maxBodyBytes)
    return failure(context, 413, "PAYLOAD_TOO_LARGE", "Message is too long.")
  let body: z.infer<typeof chatRequestSchema>
  try {
    body = chatRequestSchema.parse(JSON.parse(raw))
  } catch {
    return failure(context, 400, "BAD_REQUEST", "Invalid assistant message.")
  }

  let conversation: Awaited<
    ReturnType<AssistantChatRepository["readConversation"]>
  >
  try {
    conversation = await repository.readConversation(body.conversationId)
  } catch (error) {
    if (error instanceof AssistantRecordError)
      return failure(context, 404, error.code, error.message)
    throw error
  }
  const draftId = conversation.setupDraft?.id
  const productMode = conversation.purpose === "PRODUCT_CREATE"
  const productSnapshot = productMode
    ? productWorkflowContextSchema.parse(conversation.workflowContext).snapshot
    : null
  if (conversation.status !== "ACTIVE" || !draftId)
    return failure(
      context,
      409,
      "CONVERSATION_CLOSED",
      "Start setup with the assistant first.",
    )

  let lease: ReturnType<AssistantStreamGuard["acquire"]>
  try {
    lease = deps.guard.acquire(scope.userId)
  } catch (error) {
    if (error instanceof AssistantLimitError) {
      context.header(
        "Retry-After",
        String(
          Math.max(1, Math.ceil((error.resetAt.getTime() - Date.now()) / 1000)),
        ),
      )
      return failure(context, error.status, error.code, error.message)
    }
    throw error
  }
  // Every return before the stream starts must hand the slot back.
  let streaming = false
  try {
    const model = await deps.resolveModel({ scope, repository })
    if (!model)
      return failure(
        context,
        503,
        "ASSISTANT_UNAVAILABLE",
        "The assistant is unavailable right now. You can still set up your business yourself.",
      )

    const budgetScopeKey = assistantBudgetScopeKey(scope.tenantId, "SETUP")
    const textParts = body.message.parts.filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    const attachmentIds = body.message.parts.flatMap((part) =>
      part.type === SETUP_ATTACHMENT_PART ? [part.data.attachmentId] : [],
    )
    if (attachmentIds.length > 0 && !isSetupAssistantMediaEnabled())
      return failure(
        context,
        412,
        SETUP_MEDIA_DISABLED.code,
        SETUP_MEDIA_DISABLED.message,
      )
    const attachments = await repository.readAttachmentsToSend(attachmentIds)
    const refusal = attachmentSendRefusal(attachments, {
      conversationId: conversation.id,
      messageId: body.message.id,
      requested: attachmentIds,
    })
    if (refusal)
      return failure(context, 409, refusal, ATTACHMENT_REFUSALS[refusal] ?? "")
    const userMessage: AssistantStoredMessage = {
      id: body.message.id,
      role: "user",
      parts: storedUserParts(
        textParts,
        attachments,
        attachmentIds,
      ) as unknown as AssistantStoredMessage["parts"],
    }
    let begun: Awaited<ReturnType<AssistantChatRepository["beginRun"]>>
    try {
      begun = await repository.beginRun({
        actorUserId: scope.userId,
        conversationId: conversation.id,
        model: model.modelId,
        promptVersion: productMode
          ? PRODUCT_ASSISTANT_PROMPT_VERSION
          : SETUP_ASSISTANT_PROMPT_VERSION,
        provider: model.provider,
        requestId: body.requestId,
        userMessage,
        attachmentIds,
      })
    } catch (error) {
      if (error instanceof AssistantAttachmentError)
        return failure(
          context,
          409,
          error.code,
          ATTACHMENT_REFUSALS[error.code] ?? error.message,
        )
      if (error instanceof AssistantRecordError)
        return failure(context, 409, error.code, error.message)
      throw error
    }
    if (begun.replay)
      return failure(
        context,
        409,
        "REQUEST_REPLAYED",
        "This message was already sent. Refresh to see the reply.",
      )
    const budget = await repository.reserveBudget({
      scopeKey: budgetScopeKey,
      limits: SETUP_BUDGET_LIMITS,
    })
    if (!budget.allowed) {
      await repository.completeRun({
        runId: begun.run.id,
        tenantId: scope.tenantId,
        actorUserId: scope.userId,
        provider: model.provider,
        model: model.modelId,
        status: "FAILED",
        errorCode: "BUDGET_EXHAUSTED",
        // The owner's message is already stored; answer it so the history
        // does not show it unanswered after a reload.
        assistantMessage: {
          id: newAssistantMessageId(),
          role: "assistant",
          parts: [{ type: "text", text: BUDGET_EXHAUSTED_MESSAGE }],
        },
      })
      return failure(context, 429, "BUDGET_EXHAUSTED", BUDGET_EXHAUSTED_MESSAGE)
    }

    const [{ context: business }, storedHistory] = await Promise.all([
      repository.loadBusinessContext(),
      repository.listMessages(conversation.id, { limit: 40 }),
    ])
    const history = storedHistory as unknown as SetupUIMessage[]
    const sentAttachments = await repository.readSentAttachments(
      conversation.id,
      referencedAttachmentIds(
        storedHistory as unknown as Parameters<
          typeof referencedAttachmentIds
        >[0],
      ),
    )
    // Attachments reach the model only as delimited, untrusted text.
    const modelHistory = withAttachmentText(
      history as unknown as Parameters<typeof withAttachmentText>[0],
      sentAttachments,
    ) as unknown as SetupUIMessage[]
    const modelMessages = await convertToModelMessages(
      modelHistory.map(({ role, parts }) => ({ role, parts })),
      { ignoreIncompleteToolCalls: true },
    )
    const startedAt = Date.now()
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), foregroundDeadlineMs)
    // A stream nobody reads never reaches onFinish; free the slot regardless.
    const leaseSafety = setTimeout(
      () => lease.release(),
      foregroundDeadlineMs + 15_000,
    )
    // A dropped connection does not stop the turn: its draft writes and reply
    // are saved for the reconnecting client. Only an explicit Stop cancels it.
    deps.activeRuns.set(begun.run.id, controller)
    let resolveFinish: (value: {
      usage?: LanguageModelUsage
      steps: number
    }) => void
    const finished = new Promise<{ usage?: LanguageModelUsage; steps: number }>(
      (resolve) => {
        resolveFinish = resolve
      },
    )
    let failed = false
    const streamFailed = (error: unknown) => {
      failed = true
      console.error("[assistant] turn failed", {
        runId: begun.run.id,
        name: error instanceof Error ? error.name : "unknown",
      })
      return STREAM_FAILURE_MESSAGE
    }

    const stream = createUIMessageStream<SetupUIMessage>({
      originalMessages: history,
      generateId: newAssistantMessageId,
      execute: async ({ writer }) => {
        writer.write({
          type: "data-setup-run",
          data: {
            runId: begun.run.id,
            remainingRequests: budget.remainingRequests,
          },
          transient: true,
        })
        const setupTools = createSetupAssistantTools({
          productOnly: productMode,
          productSeed: productSnapshot?.form,
          context: business,
          sourceMessageId: body.message.id,
          knownAttachments: knownAttachments(sentAttachments),
          authorize: async () =>
            !controller.signal.aborted &&
            (await repository.isActorStillAuthorized(conversation.id)) &&
            (!productMode ||
              (await repository.readRun(begun.run.id))?.status === "RUNNING") &&
            !controller.signal.aborted,
          readDraft: () => repository.readDraftEntities(draftId),
          readAreaMarks: productMode
            ? undefined
            : () => repository.readAreaMarks(draftId),
          markArea: productMode
            ? undefined
            : (area, mark) => repository.markArea(draftId, area, mark),
          writeEntities: (entities) =>
            repository.writeDraftEntities(
              draftId,
              entities,
              productMode ? begun.run.id : undefined,
            ),
          removeEntities: (keys) =>
            repository.removeDraftEntities(draftId, keys),
          onDraftChanged: (change) =>
            writer.write({
              type: "data-setup-draft",
              data: change,
              transient: true,
            }),
        })
        const tools = productMode
          ? {
              setup_get_context: setupTools.setup_get_context,
              setup_search_quick_setups: setupTools.setup_search_quick_setups,
              setup_search_categories: setupTools.setup_search_categories,
              setup_draft_upsert_items: setupTools.setup_draft_upsert_items,
            }
          : setupTools
        const agent = new ToolLoopAgent({
          model: model.model,
          instructions: productMode
            ? productAssistantInstructions(business)
            : buildSetupAssistantInstructions(business),
          tools,
          stopWhen: stepCountIs(8),
          maxOutputTokens: 2_000,
          maxRetries: 1,
          providerOptions: model.providerOptions as never,
          onFinish: (event) =>
            resolveFinish({
              usage: event.totalUsage,
              steps: event.steps.length,
            }),
        })
        const result = await agent.stream({
          messages: modelMessages,
          abortSignal: controller.signal,
        })
        writer.merge(
          result.toUIMessageStream({
            sendReasoning: false,
            // The model's own stream reports provider errors; its default
            // would send the provider's message to the browser.
            onError: (error) => streamFailed(error),
          }),
        )
      },
      onError: (error) => streamFailed(error),
      onFinish: async ({ responseMessage, isAborted }) => {
        clearTimeout(deadline)
        try {
          const outcome = await Promise.race([
            finished,
            new Promise<{ usage?: LanguageModelUsage; steps: number }>(
              (resolve) => setTimeout(() => resolve({ steps: 0 }), 2_000),
            ),
          ])
          const parts = persistableParts(responseMessage)
          await repository
            .completeRun({
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
              usage: usageRecord(outcome.usage),
              stepCount: outcome.steps,
              durationMs: Date.now() - startedAt,
              budgetScopeKey,
              assistantMessage:
                parts.length > 0
                  ? {
                      id: responseMessage.id,
                      role: "assistant",
                      parts:
                        parts as unknown as AssistantStoredMessage["parts"],
                    }
                  : undefined,
            })
            .catch((error: unknown) => {
              console.error("[assistant] run finalization failed", {
                runId: begun.run.id,
                name: error instanceof Error ? error.name : "unknown",
              })
            })
        } finally {
          clearTimeout(leaseSafety)
          deps.activeRuns.delete(begun.run.id)
          lease.release()
        }
      },
    })
    streaming = true
    return createUIMessageStreamResponse({
      stream,
      headers: { "Cache-Control": "no-store" },
      // Drain a server-side copy so the turn and onFinish complete even when
      // the browser or a proxy closes the response early.
      consumeSseStream: ({ stream: copy }) => {
        void copy.pipeTo(new WritableStream()).catch(() => undefined)
      },
    })
  } finally {
    if (!streaming) lease.release()
  }
}

const BUDGET_EXHAUSTED_MESSAGE =
  "You've used this business's setup assistant allowance. Your setup list is still here to review and finish."

/** What the owner sees when a turn fails; provider details stay server-side. */
const STREAM_FAILURE_MESSAGE =
  "Something went wrong. Your setup list is safe, please try again."

const runIdSchema = z.string().min(1).max(64)

/** Lets a client whose stream dropped learn whether the reply was saved. */
async function handleRunStatus(
  context: Context,
  deps: AssistantChatDependencies,
) {
  context.header("Cache-Control", "no-store")
  const admission = await admitOrRefuse(context, deps)
  if (!admission.admitted) return admission.refusal
  const runId = runIdSchema.safeParse(context.req.param("runId"))
  if (!runId.success)
    return failure(context, 400, "BAD_REQUEST", "Invalid run.")
  const run = await admission.admitted.repository.readRun(runId.data)
  if (!run)
    return failure(
      context,
      404,
      "RUN_NOT_FOUND",
      "This reply is not available.",
    )
  return context.json({
    id: run.id,
    conversationId: run.conversationId,
    status: run.status,
    errorCode: run.errorCode,
    completedAt: run.completedAt?.toISOString() ?? null,
  })
}

/** The owner's Stop: cancels their own running turn in this process. */
async function handleRunCancel(
  context: Context,
  deps: AssistantChatDependencies,
) {
  context.header("Cache-Control", "no-store")
  const admission = await admitOrRefuse(context, deps)
  if (!admission.admitted) return admission.refusal
  const runId = runIdSchema.safeParse(context.req.param("runId"))
  if (!runId.success)
    return failure(context, 400, "BAD_REQUEST", "Invalid run.")
  const run = await admission.admitted.repository.readRun(runId.data)
  if (!run)
    return failure(
      context,
      404,
      "RUN_NOT_FOUND",
      "This reply is not available.",
    )
  const controller = deps.activeRuns.get(run.id)
  controller?.abort()
  return context.json({ cancelled: Boolean(controller) })
}

export function registerAssistantChatRoutes(
  app: Pick<OpenAPIHono, "get" | "post">,
  deps: AssistantChatDependencies = defaultAssistantChatDependencies(),
) {
  app.post("/api/assistant/chat", (context) => handleChat(context, deps))
  app.get("/api/assistant/runs/:runId", (context) =>
    handleRunStatus(context, deps),
  )
  app.post("/api/assistant/runs/:runId/cancel", (context) =>
    handleRunCancel(context, deps),
  )
}
