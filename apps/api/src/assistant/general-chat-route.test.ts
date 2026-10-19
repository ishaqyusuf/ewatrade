import { describe, expect, test } from "bun:test"
import { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { registerGeneralAssistantChatRoutes } from "./general-chat-route"
import type { GeneralContext } from "./general-context"
import { type GeneralTurn, GeneralTurnError } from "./general-turn-contract"

const input = {
  conversationId: "chat-1",
  requestId: "request-1",
  message: {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "search rice" }],
  },
}
const context = {} as GeneralContext
function fixture(
  options: { denied?: boolean; error?: Error; missingRun?: boolean } = {},
) {
  const app = new OpenAPIHono()
  const calls = {
    admission: 0,
    turn: 0,
    input: null as unknown,
    context: null as unknown,
    signal: null as AbortSignal | null,
    read: null as unknown,
  }
  registerGeneralAssistantChatRoutes(app, {
    admit: async () => {
      calls.admission++
      if (options.denied)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in." })
      return context
    },
    createTurn: async (ctx, body, signal) => {
      calls.turn++
      calls.input = body
      calls.context = ctx
      calls.signal = signal ?? null
      if (options.error) throw options.error
      const stream: GeneralTurn["stream"] = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "start", messageId: "answer-1" })
          controller.enqueue({ type: "text-start", id: "text-1" })
          controller.enqueue({
            type: "text-delta",
            id: "text-1",
            delta: "Saved answer",
          })
          controller.enqueue({ type: "text-end", id: "text-1" })
          controller.enqueue({ type: "finish" })
          controller.close()
        },
      })
      return {
        runId: "run-1",
        stream,
        completion: Promise.resolve({
          runId: "run-1",
          status: "COMPLETED",
          persisted: true,
          assistantMessageId: "answer-1",
        }),
      }
    },
    readRun: async (ctx, runId) => {
      calls.read = { ctx, runId }
      return options.missingRun
        ? null
        : {
            id: runId,
            conversationId: "chat-1",
            status: "COMPLETED",
            errorCode: null,
          }
    },
  })
  const post = (body: unknown = input) =>
    app.request("/api/assistant/general/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  return { app, calls, post }
}

describe("GENERAL HTTP adapter", () => {
  test("admits before reading or executing an untrusted turn", async () => {
    const f = fixture({ denied: true })
    const response = await f.post("{bad json")
    expect(response.status).toBe(401)
    expect(f.calls.admission).toBe(1)
    expect(f.calls.turn).toBe(0)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
  test("forwards only the validated turn and cancellation through the existing SSE contract", async () => {
    const f = fixture()
    const response = await f.post()
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.text()).toContain("Saved answer")
    expect(f.calls.context).toBe(context)
    expect(f.calls.input).toEqual(input)
    expect(f.calls.signal).toBeInstanceOf(AbortSignal)
  })
  test("rejects malformed, oversized and actor-injected messages before the runner", async () => {
    const f = fixture()
    for (const body of [
      "{bad json",
      { ...input, actorUserId: "foreign" },
      { ...input, tenantId: "foreign" },
      { ...input, message: { ...input.message, role: "assistant" } },
    ]) {
      expect((await f.post(body)).status).toBe(400)
    }
    expect((await f.post("a".repeat(65537))).status).toBe(413)
    expect(f.calls.turn).toBe(0)
  })
  test.each([
    [409, "REQUEST_REPLAYED"],
    [429, "BUDGET_EXHAUSTED"],
    [503, "ASSISTANT_UNAVAILABLE"],
    [409, "ATTACHMENT_NOT_READY"],
  ] as const)(
    "preserves runner status %s and code %s",
    async (status, code) => {
      const f = fixture({
        error: new GeneralTurnError(status, code, "Safe recovery message."),
      })
      const response = await f.post()
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({
        code,
        error: "Safe recovery message.",
      })
      expect(response.headers.get("cache-control")).toBe("no-store")
    },
  )
  test("retains scoped private run-status lookup", async () => {
    const f = fixture()
    const response = await f.app.request("/api/assistant/general/runs/run-42")
    expect(response.status).toBe(200)
    expect(f.calls.read).toEqual({ ctx: context, runId: "run-42" })
    expect(response.headers.get("cache-control")).toBe("no-store")
    const missing = fixture({ missingRun: true })
    expect(
      (await missing.app.request("/api/assistant/general/runs/foreign")).status,
    ).toBe(404)
    const denied = fixture({ denied: true })
    expect(
      (await denied.app.request("/api/assistant/general/runs/foreign")).status,
    ).toBe(401)
    expect(denied.calls.read).toBeNull()
  })
  test("propagates transport cancellation to the shared turn", async () => {
    const f = fixture()
    const controller = new AbortController()
    const response = await f.app.request(
      new Request("http://localhost/api/assistant/general/chat", {
        method: "POST",
        body: JSON.stringify(input),
        signal: controller.signal,
      }),
    )
    expect(f.calls.signal?.aborted).toBe(false)
    controller.abort()
    expect(f.calls.signal?.aborted).toBe(true)
    await response.text()
  })
  test("keeps unexpected infrastructure details out of the response", async () => {
    const f = fixture({ error: new Error("private-infrastructure-detail") })
    const response = await f.post()
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).toContain("ASSISTANT_UNAVAILABLE")
    expect(body).not.toContain("private-infrastructure-detail")
  })
})
