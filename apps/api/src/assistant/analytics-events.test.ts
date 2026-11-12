import { afterEach, beforeEach, expect, mock, test } from "bun:test"

const recorded: Array<Record<string, unknown>> = []
mock.module("@ewatrade/jobs/assistant-events", () => ({
  recordAssistantEvent: async (input: Record<string, unknown>) => {
    recorded.push(input)
  },
}))
const {
  assistantEventScope,
  assistantInputKind,
  assistantProcedureEvents,
  captureAssistantProcedureEvents,
  emitAssistantEvents,
} = await import("./analytics")

const flags = [
  "LOGLY_ASSISTANT_EVENTS_ENABLED",
  "NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED",
] as const
const original = Object.fromEntries(flags.map((key) => [key, process.env[key]]))
beforeEach(() => {
  recorded.length = 0
  process.env.LOGLY_ASSISTANT_EVENTS_ENABLED = "true"
  process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED = "true"
})
afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function ctx(headers: Record<string, string> = {}) {
  return {
    requestHeaders: new Headers(headers),
    session: {
      user: { id: "user", email: "owner@example.com", isPlatformAdmin: false },
    },
    tenantContext: {
      tenant: { id: "tenant", name: "Business", dataClassification: "LIVE" },
      membership: { role: "OWNER" },
    },
    qaSessionScope: null,
  }
}
const proposal = (status: string) => ({
  id: "proposal-1",
  revision: 2,
  status,
  payload: { action: "sale_record", customerPhone: "+2348031234567" },
})

test("scope reads the app client from the analytics-only header", () => {
  expect(assistantEventScope(ctx())?.channel).toBe("web")
  expect(
    assistantEventScope(ctx({ "x-ewatrade-client": "mobile" }))?.channel,
  ).toBe("mobile")
  expect(
    assistantEventScope(ctx({ "x-ewatrade-client": "telegram" })),
  ).toBeNull()
  expect(
    assistantEventScope({ ...ctx(), session: { user: { id: "user" } } }),
  ).toBeNull()
})

test("one turn emission records exactly one event per run key", async () => {
  const run = {
    name: "assistant_turn_completed" as const,
    key: "run:abc",
    details: { step_count: 2 },
  }
  emitAssistantEvents(ctx({ "x-ewatrade-client": "mobile" }), [run])
  await Promise.resolve()
  expect(recorded).toHaveLength(1)
  expect(recorded[0]).toMatchObject({ channel: "mobile", key: "run:abc" })
})

test("flag off records nothing", async () => {
  process.env.LOGLY_ASSISTANT_EVENTS_ENABLED = "false"
  emitAssistantEvents(ctx(), [
    { name: "assistant_turn_completed", key: "run:abc" },
  ])
  await captureAssistantProcedureEvents(
    { ...ctx(), db: {} as never },
    {
      path: "assistant.decideProposal",
      rawInput: { proposalId: "proposal-1", decision: "confirm" },
      result: { ok: true, data: proposal("COMPLETED") },
    },
  )
  expect(recorded).toHaveLength(0)
})

test("decisions map to fixed action events keyed by proposal revision", () => {
  const confirmed = assistantProcedureEvents({
    path: "assistant.decideProposal",
    input: { proposalId: "proposal-1", decision: "confirm" },
    output: proposal("COMPLETED"),
  })
  expect(confirmed.map((event) => event.name)).toEqual([
    "assistant_action_confirmed",
    "assistant_action_executed",
  ])
  expect(confirmed[0]).toMatchObject({
    key: "proposal:proposal-1:2",
    details: { action: "sale_record" },
  })
  expect(JSON.stringify(confirmed)).not.toContain("+234")
  expect(
    assistantProcedureEvents({
      path: "assistant.decideReviewLink",
      input: { token: "secret-token", decision: "cancel" },
      output: proposal("CANCELLED"),
    }),
  ).toEqual([
    {
      name: "assistant_action_cancelled",
      key: "proposal:proposal-1:2",
      details: { action: "sale_record", handoff_from: "whatsapp" },
    },
  ])
  expect(
    assistantProcedureEvents({
      path: "assistant.decideProposal",
      input: {},
      output: { status: "unavailable" },
    }),
  ).toEqual([])
})

test("review hand-off and channel link lifecycle events", () => {
  expect(
    assistantProcedureEvents({
      path: "assistant.reviewLink",
      input: { token: "secret-token" },
      output: { status: "ready", proposal: proposal("PENDING") },
    }),
  ).toEqual([
    {
      name: "assistant_review_link_opened",
      key: "proposal:proposal-1:2",
      details: { action: "sale_record", handoff_from: "whatsapp" },
    },
  ])
  expect(
    assistantProcedureEvents({
      path: "assistant.reviewLink",
      input: { token: "secret-token" },
      output: { status: "expired" },
    }),
  ).toEqual([])
  expect(
    assistantProcedureEvents({
      path: "assistantChannels.createWhatsAppLink",
      input: {},
      output: { id: "link-1", url: "https://wa.me/234803?text=CODE" },
    }),
  ).toEqual([
    {
      name: "assistant_channel_link_started",
      key: "link:whatsapp:link-1",
      details: { link_channel: "whatsapp" },
    },
  ])
  expect(
    assistantProcedureEvents({
      path: "assistantChannels.confirmTelegramLink",
      input: { linkId: "link-2", revision: 1 },
      output: { id: "link-2", maskedSender: "@private" },
    })[0],
  ).toMatchObject({
    name: "assistant_channel_link_completed",
    key: "link:telegram:link-2",
  })
  expect(
    assistantProcedureEvents({
      path: "assistantChannels.revokeTelegram",
      input: { grantId: "grant-1" },
      output: { revoked: false },
    }),
  ).toEqual([])
  expect(
    assistantProcedureEvents({
      path: "assistantChannels.revokeWhatsApp",
      input: { grantId: "grant-1" },
      output: { revoked: true },
    })[0]?.name,
  ).toBe("assistant_channel_link_revoked")
})

test("a refused confirm is expired when the draft lapsed, otherwise failed", async () => {
  const db = (row: Record<string, unknown>) =>
    ({
      assistantActionProposal: { findFirst: async () => row },
    }) as never
  const lapsed = {
    action: "sale_record",
    revision: 2,
    status: "PENDING",
    expiresAt: new Date(Date.now() - 1000),
  }
  const input = {
    path: "assistant.decideProposal",
    rawInput: { proposalId: "proposal-1", decision: "confirm" },
    result: { ok: false as const, errorCode: "CONFLICT" },
  }
  await captureAssistantProcedureEvents({ ...ctx(), db: db(lapsed) }, input)
  await captureAssistantProcedureEvents(
    {
      ...ctx(),
      db: db({ ...lapsed, expiresAt: new Date(Date.now() + 60_000) }),
    },
    input,
  )
  await Promise.resolve()
  expect(recorded.map((event) => event.name)).toEqual([
    "assistant_action_expired",
    "assistant_action_failed",
  ])
  expect(recorded[1]).toMatchObject({
    details: { action: "sale_record", error_code: "CONFLICT" },
  })
})

test("input kind is coarse and content-free", () => {
  expect(assistantInputKind([])).toBe("text")
  expect(assistantInputKind([{ kind: "IMAGE" }, { kind: "AUDIO" }])).toBe(
    "voice",
  )
  expect(assistantInputKind([{ kind: "IMAGE" }])).toBe("image")
  expect(assistantInputKind([{ kind: "PDF" }])).toBe("document")
})
