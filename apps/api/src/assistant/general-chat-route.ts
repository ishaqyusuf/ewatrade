import {
  type GeneralDataParts,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  GENERAL_PROMPT_VERSION,
  generalInstructions,
} from "@ewatrade/assistant/general/prompt"
import {
  type AssistantStoredMessage,
  beginAssistantRunInTransaction,
  completeAssistantRun,
  listAssistantMessages,
  newAssistantMessageId,
  reserveAssistantBudget,
} from "@ewatrade/db/assistant"
import {
  readGeneralActiveRun,
  readGeneralConversation,
  readGeneralRun,
} from "@ewatrade/db/assistant-general"
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
import { resolveModel } from "./chat-route"
import {
  GENERAL_BUDGET_LIMITS,
  generalBudgetScopeKey,
} from "./general-allowance"
import { requireGeneralScope } from "./general-context"
import { createGeneralTools } from "./general-tools"
export type GeneralUIMessage = UIMessage<never, GeneralDataParts>
const requestSchema = z
  .object({
    conversationId: z.string().min(1).max(128),
    requestId: z.string().min(8).max(120),
    message: z
      .object({
        id: z.string().min(1).max(80),
        role: z.literal("user"),
        parts: z
          .array(
            z
              .object({
                type: z.literal("text"),
                text: z.string().min(1).max(8000),
              })
              .strict(),
          )
          .min(1)
          .max(4),
      })
      .strict(),
  })
  .strict()
const failure = (c: Context, status: number, code: string, error: string) => {
  c.header("Cache-Control", "no-store")
  return c.json({ code, error }, status as 400)
}
export function registerGeneralAssistantChatRoutes(app: OpenAPIHono) {
  app.get("/api/assistant/general/runs/:runId", async (c) => {
    c.header("Cache-Control", "no-store")
    try {
      const ctx = await resolveProtectedTenantContext(
        await createTRPCContext(undefined, c),
      )
      const run = await readGeneralRun(
        ctx.db,
        requireGeneralScope(ctx),
        c.req.param("runId"),
      )
      return run
        ? c.json(run)
        : failure(
            c,
            404,
            "NOT_FOUND",
            "Reply status unavailable in this Store.",
          )
    } catch (error) {
      return routeFailure(c, error)
    }
  })
  app.post("/api/assistant/general/chat", async (c) => {
    try {
      const ctx = await resolveProtectedTenantContext(
        await createTRPCContext(undefined, c),
      )
      const scope = requireGeneralScope(ctx)
      const raw = await c.req.text()
      if (new TextEncoder().encode(raw).length > 64 * 1024)
        return failure(c, 413, "PAYLOAD_TOO_LARGE", "Message is too long.")
      let body: z.infer<typeof requestSchema>
      try {
        body = requestSchema.parse(JSON.parse(raw))
      } catch {
        return failure(c, 400, "BAD_REQUEST", "Invalid assistant message.")
      }
      const conversation = await readGeneralConversation(
        ctx.db,
        scope,
        body.conversationId,
      )
      if (!conversation)
        return failure(
          c,
          404,
          "NOT_FOUND",
          "Conversation unavailable in this Store.",
        )
      const model = await resolveModel(
        ctx.db,
        scope.dataClassification,
        "GENERAL",
      )
      if (!model)
        return failure(
          c,
          503,
          "ASSISTANT_UNAVAILABLE",
          "The assistant is unavailable. Your saved answers and proposals are still here.",
        )
      const budgetScopeKey = generalBudgetScopeKey(scope)
      const begun = await ctx.db.$transaction(async (tx) => {
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
          promptVersion: GENERAL_PROMPT_VERSION,
          provider: model.provider,
          requestId: body.requestId,
          userMessage: { ...body.message },
        })
      })
      if (begun.replay)
        return failure(
          c,
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
        return failure(
          c,
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
      const history: GeneralUIMessage[] = stored.flatMap((message) => {
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
      const messages = await convertToModelMessages(
        history.map(({ role, parts }) => ({
          role,
          parts: parts.filter((part) => part.type === "text"),
        })),
      )
      const controller = new AbortController()
      const deadline = setTimeout(() => controller.abort(), 45_000)
      const abort = () => controller.abort()
      c.req.raw.signal.addEventListener("abort", abort, { once: true })
      const startedAt = Date.now()
      let failed = false
      let usage: LanguageModelUsage | undefined
      let steps = 0
      const stream = createUIMessageStream<GeneralUIMessage>({
        originalMessages: history,
        generateId: newAssistantMessageId,
        execute: async ({ writer }) => {
          writer.write({
            type: "data-general-run",
            data: {
              runId: begun.run.id,
              remainingRequests: budget.remainingRequests,
            },
            transient: true,
          })
          const agent = new ToolLoopAgent({
            model: model.model,
            instructions: generalInstructions({
              businessName: ctx.tenantContext.tenant.name,
              storeName: ctx.tenantContext.activeStore?.name ?? "Store",
              currencyCode:
                ctx.tenantContext.activeStore?.currencyCode ??
                ctx.tenantContext.tenant.currencyCode,
              role: ctx.tenantContext.membership.role,
            }),
            tools: createGeneralTools(
              ctx,
              conversation.id,
              (proposalId) =>
                writer.write({
                  type: "data-general-proposal",
                  data: { proposalId },
                  transient: true,
                }),
              (answer) =>
                writer.write({ type: "data-general-answer", data: answer }),
            ),
            stopWhen: stepCountIs(6),
            maxOutputTokens: 2000,
            maxRetries: 1,
            providerOptions: model.providerOptions as never,
            onFinish: (event) => {
              usage = event.totalUsage
              steps = event.steps.length
            },
          })
          const result = await agent.stream({
            messages,
            abortSignal: controller.signal,
          })
          writer.merge(result.toUIMessageStream({ sendReasoning: false }))
        },
        onError: () => {
          failed = true
          return "Reply interrupted. Your saved answers and drafts are safe. Check reply status before retrying."
        },
        onFinish: async ({ responseMessage, isAborted }) => {
          clearTimeout(deadline)
          c.req.raw.signal.removeEventListener("abort", abort)
          const parts = responseMessage.parts.flatMap((part) => {
            const parsed = generalStoredPartSchema.safeParse(part)
            return parsed.success ? [parsed.data] : []
          })
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
            usage: usage
              ? {
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens,
                  totalTokens: usage.totalTokens,
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
          }).catch((error: unknown) =>
            console.error("[assistant] General run finalization failed", {
              runId: begun.run.id,
              name: error instanceof Error ? error.name : "unknown",
            }),
          )
        },
      })
      return createUIMessageStreamResponse({
        stream,
        headers: { "Cache-Control": "no-store" },
      })
    } catch (error) {
      return routeFailure(c, error)
    }
  })
}
function routeFailure(c: Context, error: unknown) {
  return error instanceof TRPCError
    ? failure(c, getHTTPStatusCodeFromError(error), error.code, error.message)
    : failure(
        c,
        503,
        "ASSISTANT_UNAVAILABLE",
        "Assistant unavailable. Check your saved thread before trying again.",
      )
}
