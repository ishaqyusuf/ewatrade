import { ASSISTANT_RUNTIME_CONFIGURATION_KEY } from "@ewatrade/ai/runtime-config"
import type { prisma } from "@ewatrade/db"
import { AssistantRecordError } from "@ewatrade/db/assistant"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import { createUIMessageStreamResponse } from "ai"
import type { Context } from "hono"
import { z } from "zod"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import {
  type AssistantChatRepository,
  createAssistantChatRepository,
} from "./chat-repository"
import {
  type ResolvedAssistantModel,
  resolveGeneralAssistantModel,
  resolveSetupAssistantModel,
} from "./model-resolution"
import { requireSetupAssistantScope } from "./setup-context"
import { AssistantStreamGuard } from "./stream-guard"
import {
  type WorkflowChatScope,
  createWorkflowAssistantTurn,
} from "./workflow-turn"
import { WorkflowTurnError } from "./workflow-turn-contract"
export type { SetupUIMessage } from "./workflow-turn"

const maxBodyBytes = 64 * 1024

type ChatScope = WorkflowChatScope

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

async function handleChat(context: Context, deps: AssistantChatDependencies) {
  context.header("Cache-Control", "no-store")
  const admission = await admitOrRefuse(context, deps)
  if (!admission.admitted) return admission.refusal
  const raw = await context.req.text()
  if (raw.length > maxBodyBytes)
    return failure(context, 413, "PAYLOAD_TOO_LARGE", "Message is too long.")
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return failure(context, 400, "BAD_REQUEST", "Invalid assistant message.")
  }
  try {
    const turn = await createWorkflowAssistantTurn(
      {
        ...admission.admitted,
        resolveModel: deps.resolveModel,
        guard: deps.guard,
        activeRuns: deps.activeRuns,
      },
      body,
    )
    return createUIMessageStreamResponse({
      stream: turn.stream,
      headers: { "Cache-Control": "no-store" },
      // Keep canonical persistence running after a transport disconnect.
      consumeSseStream: ({ stream: copy }) => {
        void copy.pipeTo(new WritableStream()).catch(() => undefined)
      },
    })
  } catch (error) {
    if (!(error instanceof WorkflowTurnError)) throw error
    if (error.resetAt)
      context.header(
        "Retry-After",
        String(
          Math.max(1, Math.ceil((error.resetAt.getTime() - Date.now()) / 1000)),
        ),
      )
    return failure(context, error.status, error.code, error.message)
  }
}

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
