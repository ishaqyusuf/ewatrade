import { expect, test } from "bun:test"
import {
  defaultAssistantWhatsAppTurnDependencies,
  runAssistantWhatsAppTurn,
} from "./assistant-whatsapp-turn"

test("job sends only the ingress ID to the configured API with bounded time and no redirects", async () => {
  const calls: unknown[] = []
  const next: string[] = []
  const result = await runAssistantWhatsAppTurn(
    { ingressId: "inbox-1" },
    {
      endpoint: () => ({
        url: new URL(
          "https://api.example.test/api/internal/assistant/channel-turn",
        ),
        key: "synthetic-key",
      }),
      send: async (url, init) => {
        calls.push({
          url: url.toString(),
          body: JSON.parse(String(init.body)),
          redirect: init.redirect,
          headers: init.headers,
          signal: init.signal instanceof AbortSignal,
        })
        return Response.json({ status: "completed", nextIngressId: "inbox-2" })
      },
      enqueue: async (id) => {
        next.push(id)
      },
    },
  )
  expect(result).toEqual({ status: "completed" })
  expect(calls).toEqual([
    {
      url: "https://api.example.test/api/internal/assistant/channel-turn",
      body: { ingressId: "inbox-1" },
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": "synthetic-key",
      },
      signal: true,
    },
  ])
  expect(next).toEqual(["inbox-2"])
})
test("job errors never include private HTTP/provider content and malformed jobs do not dispatch", async () => {
  const deps = {
    endpoint: () => ({
      url: new URL("https://api.example.test"),
      key: "synthetic-key",
    }),
    send: async () => new Response("private-error", { status: 503 }),
    enqueue: async () => {},
  }
  await expect(
    runAssistantWhatsAppTurn({ ingressId: "inbox-1" }, deps),
  ).rejects.toThrow("Assistant worker request unavailable.")
  await expect(
    runAssistantWhatsAppTurn(
      { ingressId: "inbox-1" },
      {
        ...deps,
        send: async () => {
          throw Error("private-error")
        },
      },
    ),
  ).rejects.toThrow("Assistant worker request interrupted.")
  await expect(
    runAssistantWhatsAppTurn(
      { ingressId: "inbox-1", actorUserId: "foreign" } as never,
      {
        ...deps,
        send: async () => {
          throw Error("must not send")
        },
      },
    ),
  ).rejects.toThrow("Invalid assistant job.")
})
test("a failed next dispatch leaves its durable row for recovery without repeating the completed turn", async () => {
  let sends = 0
  expect(
    await runAssistantWhatsAppTurn(
      { ingressId: "inbox-1" },
      {
        endpoint: () => ({
          url: new URL("https://api.example.test"),
          key: "synthetic",
        }),
        send: async () => {
          sends++
          return Response.json({
            status: "completed",
            nextIngressId: "inbox-2",
          })
        },
        enqueue: async () => {
          throw Error("queue down")
        },
      },
    ),
  ).toEqual({ status: "completed" })
  expect(sends).toBe(1)
})

test("worker endpoint configuration never sends a key to insecure or credential-bearing origins", () => {
  const names = ["API_URL", "INTERNAL_API_KEY", "APP_ENV"] as const
  const previous = Object.fromEntries(
    names.map((key) => [key, process.env[key]]),
  )
  try {
    process.env.INTERNAL_API_KEY = "synthetic-key"
    process.env.APP_ENV = "production"
    for (const url of [
      "http://api.example.test",
      "https://user:secret@api.example.test",
      "https://api.example.test?override=1",
    ]) {
      process.env.API_URL = url
      expect(() =>
        defaultAssistantWhatsAppTurnDependencies().endpoint(),
      ).toThrow("endpoint invalid")
    }
    process.env.API_URL = "https://api.example.test"
    expect(
      defaultAssistantWhatsAppTurnDependencies().endpoint().url.toString(),
    ).toBe("https://api.example.test/api/internal/assistant/channel-turn")
    Reflect.deleteProperty(process.env, "INTERNAL_API_KEY")
    expect(() => defaultAssistantWhatsAppTurnDependencies().endpoint()).toThrow(
      "endpoint unavailable",
    )
  } finally {
    for (const key of names) {
      if (previous[key] === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = previous[key]
    }
  }
})
