import {
  type AssistantLanguageModel,
  createAssistantLanguageModel,
} from "@ewatrade/ai/provider"
import { createRehearsalModel } from "@ewatrade/ai/rehearsal-model"
import {
  ASSISTANT_RUNTIME_CONFIGURATION_KEY,
  resolveAssistantRuntimeConfiguration,
} from "@ewatrade/ai/runtime-config"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"
import { SETUP_ASSISTANT_PROMPT_VERSION } from "@ewatrade/assistant/setup/contracts"
import type { SetupAssistantDataParts } from "@ewatrade/assistant/setup/messages"
import { buildSetupAssistantInstructions } from "@ewatrade/assistant/setup/prompt"
import { respondSetupRehearsal } from "@ewatrade/assistant/setup/rehearsal"
import { createSetupAssistantTools } from "@ewatrade/assistant/setup/tools"
import type { prisma } from "@ewatrade/db"
import {
  AssistantRecordError,
  type AssistantStoredMessage,
  assistantBudgetScopeKey,
  beginAssistantRun,
  completeAssistantRun,
  listAssistantMessages,
  newAssistantMessageId,
  readAssistantConversation,
  readSetupDraft,
  removeSetupDraftEntities,
  reserveAssistantBudget,
  upsertSetupDraftEntities,
} from "@ewatrade/db/assistant"
import { evaluateQaProviderPolicy } from "@ewatrade/utils/qa-provider-policy"
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
  SETUP_BUDGET_LIMITS,
  loadSetupBusinessContext,
  requireSetupAssistantScope,
} from "./setup-context"
import { setupRunLookup } from "./setup-run-lookup"

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
          z.object({
            type: z.literal("text"),
            text: z.string().min(1).max(8000),
          }),
        )
        .min(1)
        .max(4),
    }),
  })
  .strict()

type ResolvedModel = AssistantLanguageModel & { rehearsal: boolean }

export async function resolveModel(
  db: typeof prisma,
  dataClassification: "LIVE" | "QA",
  purpose: "SETUP" | "GENERAL" = "SETUP",
): Promise<ResolvedModel | null> {
  // QA data never reaches a live provider; the rehearsal model is the test adapter.
  const rehearsalRequested =
    process.env.ASSISTANT_REHEARSAL_MODE === "true" &&
    process.env.APP_ENV !== "production"
  if (dataClassification === "QA" || rehearsalRequested) {
    const decision = evaluateQaProviderPolicy({
      adapter: "test",
      operation: "ai_analysis",
      tenantDataClassification: dataClassification,
    })
    if (!decision.allowed) return null
    return {
      model: createRehearsalModel((prompt) =>
        (purpose === "GENERAL"
          ? respondGeneralRehearsal
          : respondSetupRehearsal)(
          prompt as Parameters<typeof respondSetupRehearsal>[0],
        ),
      ),
      provider: "ewatrade-rehearsal",
      modelId: "rehearsal-v1",
      providerOptions: {},
      rehearsal: true,
    }
  }
  const stored = await db.systemConfiguration.findUnique({
    where: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY },
    select: { value: true },
  })
  const configuration = resolveAssistantRuntimeConfiguration(stored?.value)
  if (!configuration) return null
  const model = createAssistantLanguageModel(configuration)
  return model ? { ...model, rehearsal: false } : null
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

export function registerAssistantChatRoutes(app: OpenAPIHono) {
  app.get("/api/assistant/runs/:runId", async (context) => {
    context.header("Cache-Control", "no-store")
    try {
      const ctx = await resolveProtectedTenantContext(
        await createTRPCContext(undefined, context),
      )
      const scope = requireSetupAssistantScope(ctx)
      const run = await ctx.db.assistantRun.findFirst(
        setupRunLookup(scope, context.req.param("runId")),
      )
      return run
        ? context.json(run)
        : failure(
            context,
            404,
            "NOT_FOUND",
            "This reply is unavailable in the current Store.",
          )
    } catch (error) {
      if (error instanceof TRPCError)
        return failure(
          context,
          getHTTPStatusCodeFromError(error),
          error.code,
          error.message,
        )
      return failure(
        context,
        503,
        "ASSISTANT_UNAVAILABLE",
        "Reply status could not be loaded. Refresh your setup list.",
      )
    }
  })
  app.post("/api/assistant/chat", async (context) => {
    context.header("Cache-Control", "no-store")
    let ctx: Awaited<ReturnType<typeof resolveProtectedTenantContext>>
    let scope: ReturnType<typeof requireSetupAssistantScope>
    try {
      ctx = await resolveProtectedTenantContext(
        await createTRPCContext(undefined, context),
      )
      scope = requireSetupAssistantScope(ctx)
    } catch (error) {
      if (error instanceof TRPCError)
        return failure(
          context,
          getHTTPStatusCodeFromError(error),
          error.code,
          error.message,
        )
      throw error
    }

    const raw = await context.req.text()
    if (raw.length > maxBodyBytes)
      return failure(context, 413, "PAYLOAD_TOO_LARGE", "Message is too long.")
    let body: z.infer<typeof chatRequestSchema>
    try {
      body = chatRequestSchema.parse(JSON.parse(raw))
    } catch {
      return failure(context, 400, "BAD_REQUEST", "Invalid assistant message.")
    }

    const { db } = ctx
    let conversation: Awaited<ReturnType<typeof readAssistantConversation>>
    try {
      conversation = await readAssistantConversation(
        db,
        scope,
        body.conversationId,
      )
    } catch (error) {
      if (error instanceof AssistantRecordError)
        return failure(context, 404, error.code, error.message)
      throw error
    }
    const draftId = conversation.setupDraft?.id
    if (conversation.status !== "ACTIVE" || !draftId)
      return failure(
        context,
        409,
        "CONVERSATION_CLOSED",
        "Start setup with the assistant first.",
      )

    const model = await resolveModel(db, scope.dataClassification)
    if (!model)
      return failure(
        context,
        503,
        "ASSISTANT_UNAVAILABLE",
        "The assistant is unavailable right now. You can still set up your business yourself.",
      )

    const budgetScopeKey = assistantBudgetScopeKey(scope.tenantId, "SETUP")
    const userMessage: AssistantStoredMessage = {
      id: body.message.id,
      role: "user",
      parts: body.message.parts,
    }
    const begun = await beginAssistantRun(db, {
      actorUserId: scope.userId,
      conversationId: conversation.id,
      model: model.modelId,
      promptVersion: SETUP_ASSISTANT_PROMPT_VERSION,
      provider: model.provider,
      requestId: body.requestId,
      userMessage,
    })
    if (begun.replay)
      return failure(
        context,
        409,
        "REQUEST_REPLAYED",
        "This message was already sent. Refresh to see the reply.",
      )
    const budget = await reserveAssistantBudget(db, {
      scopeKey: budgetScopeKey,
      limits: SETUP_BUDGET_LIMITS,
    })
    if (!budget.allowed) {
      await completeAssistantRun(db, {
        runId: begun.run.id,
        tenantId: scope.tenantId,
        actorUserId: scope.userId,
        provider: model.provider,
        model: model.modelId,
        status: "FAILED",
        errorCode: "BUDGET_EXHAUSTED",
      })
      return failure(
        context,
        429,
        "BUDGET_EXHAUSTED",
        "You've used this business's setup assistant allowance. Your setup list is still here to review and finish.",
      )
    }

    const [{ context: business }, storedHistory] = await Promise.all([
      loadSetupBusinessContext(db, scope),
      listAssistantMessages(db, conversation.id, { limit: 40 }),
    ])
    const history = storedHistory as unknown as SetupUIMessage[]
    const modelMessages = await convertToModelMessages(
      history.map(({ role, parts }) => ({ role, parts })),
      { ignoreIncompleteToolCalls: true },
    )
    const startedAt = Date.now()
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), foregroundDeadlineMs)
    context.req.raw.signal.addEventListener("abort", () => controller.abort())
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

    const stream = createUIMessageStream<SetupUIMessage>({
      originalMessages: history,
      generateId: newAssistantMessageId,
      execute: async ({ writer }) => {
        writer.write({
          type: "data-setup-run",
          data: {
            remainingRequests: budget.remainingRequests,
            runId: begun.run.id,
          },
          transient: true,
        })
        const tools = createSetupAssistantTools({
          context: business,
          sourceMessageId: body.message.id,
          readDraft: async () => (await readSetupDraft(db, draftId)).entities,
          writeEntities: (entities) =>
            upsertSetupDraftEntities(db, {
              draftId,
              entities: entities.map((entity) => ({
                ...entity,
                payload: entity.payload,
                source: entity.source,
                openQuestions: entity.openQuestions,
              })),
            }),
          removeEntities: (keys) =>
            removeSetupDraftEntities(db, { draftId, keys }),
          onDraftChanged: (change) =>
            writer.write({
              type: "data-setup-draft",
              data: change,
              transient: true,
            }),
        })
        const agent = new ToolLoopAgent({
          model: model.model,
          instructions: buildSetupAssistantInstructions(business),
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
        writer.merge(result.toUIMessageStream({ sendReasoning: false }))
      },
      onError: () => {
        failed = true
        return "Something went wrong. Your setup list is safe, please try again."
      },
      onFinish: async ({ responseMessage, isAborted }) => {
        clearTimeout(deadline)
        const outcome = await Promise.race([
          finished,
          new Promise<{ usage?: LanguageModelUsage; steps: number }>(
            (resolve) => setTimeout(() => resolve({ steps: 0 }), 2_000),
          ),
        ])
        const parts = persistableParts(responseMessage)
        await completeAssistantRun(db, {
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
                  parts: parts as unknown as AssistantStoredMessage["parts"],
                }
              : undefined,
        }).catch((error: unknown) => {
          console.error("[assistant] run finalization failed", {
            runId: begun.run.id,
            name: error instanceof Error ? error.name : "unknown",
          })
        })
      },
    })
    return createUIMessageStreamResponse({
      stream,
      headers: { "Cache-Control": "no-store" },
    })
  })
}
