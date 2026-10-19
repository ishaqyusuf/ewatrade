import { readGeneralRun } from "@ewatrade/db/assistant-general"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import { createUIMessageStreamResponse } from "ai"
import type { Context } from "hono"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { createGeneralAssistantTurn } from "./general-turn"
import {
  GeneralTurnError,
  generalTurnInputSchema,
} from "./general-turn-contract"
export type { GeneralUIMessage } from "./general-turn-contract"

type GeneralChatRouteDependencies = {
  admit: (context: Context) => Promise<GeneralContext>
  createTurn: typeof createGeneralAssistantTurn
  readRun: (
    context: GeneralContext,
    runId: string,
  ) => Promise<Awaited<ReturnType<typeof readGeneralRun>>>
}
const failure = (c: Context, status: number, code: string, error: string) => {
  c.header("Cache-Control", "no-store")
  return c.json({ code, error }, status as 400)
}

/** Trusted wiring only; requests cannot replace admission or turn execution. */
export function registerGeneralAssistantChatRoutes(
  app: OpenAPIHono,
  dependencies: Partial<GeneralChatRouteDependencies> = {},
) {
  const deps: GeneralChatRouteDependencies = {
    admit: async (c) =>
      resolveProtectedTenantContext(await createTRPCContext(undefined, c)),
    createTurn: createGeneralAssistantTurn,
    readRun: (ctx, runId) =>
      readGeneralRun(ctx.db, requireGeneralScope(ctx), runId),
    ...dependencies,
  }
  app.get("/api/assistant/general/runs/:runId", async (c) => {
    c.header("Cache-Control", "no-store")
    try {
      const ctx = await deps.admit(c)
      const run = await deps.readRun(ctx, c.req.param("runId"))
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
      const ctx = await deps.admit(c)
      const raw = await c.req.text()
      if (new TextEncoder().encode(raw).length > 64 * 1024)
        return failure(c, 413, "PAYLOAD_TOO_LARGE", "Message is too long.")
      let input: unknown
      try {
        input = JSON.parse(raw)
      } catch {
        return failure(c, 400, "BAD_REQUEST", "Invalid assistant message.")
      }
      const parsed = generalTurnInputSchema.safeParse(input)
      if (!parsed.success)
        return failure(c, 400, "BAD_REQUEST", "Invalid assistant message.")
      const turn = await deps.createTurn(ctx, parsed.data, c.req.raw.signal)
      return createUIMessageStreamResponse({
        stream: turn.stream,
        headers: { "Cache-Control": "no-store" },
      })
    } catch (error) {
      return routeFailure(c, error)
    }
  })
}
function routeFailure(c: Context, error: unknown) {
  if (error instanceof GeneralTurnError)
    return failure(c, error.status, error.code, error.message)
  if (!(error instanceof TRPCError))
    console.error("[assistant] General request failed", {
      name: error instanceof Error ? error.name : "unknown",
      code:
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code.slice(0, 60)
          : undefined,
    })
  return error instanceof TRPCError
    ? failure(c, getHTTPStatusCodeFromError(error), error.code, error.message)
    : failure(
        c,
        503,
        "ASSISTANT_UNAVAILABLE",
        "Assistant unavailable. Check your saved thread before trying again.",
      )
}
