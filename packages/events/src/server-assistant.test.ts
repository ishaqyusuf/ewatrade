import { afterEach, beforeEach, expect, test } from "bun:test"
import {
  type AssistantEventInput,
  assistantCaptureAllowed,
  assistantClientChannel,
  createAssistantEvent,
} from "./server-assistant"
import { deliverDashboardOutcome } from "./server-dashboard"

const keys = [
  "LOGLY_ASSISTANT_EVENTS_ENABLED",
  "NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED",
  "LOGLY_IDENTITY_SECRET",
  "LOGLY_COLLECTOR_URL",
  "LOGLY_DASHBOARD_PROJECT_KEY",
  "APP_ENV",
]
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
beforeEach(() => {
  process.env.LOGLY_ASSISTANT_EVENTS_ENABLED = "true"
  process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED = "true"
  process.env.LOGLY_IDENTITY_SECRET = "test-only-identity-secret-32-characters"
  process.env.LOGLY_COLLECTOR_URL = "https://collector.example"
  process.env.LOGLY_DASHBOARD_PROJECT_KEY = "dashboard-test-key"
  process.env.APP_ENV = "production"
})
afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const webHeaders = () =>
  new Headers({
    origin: "https://dash.ewatrade.com",
    "x-ewatrade-client": "web",
    "x-ewatrade-analytics": "allowed",
  })
const mobileHeaders = () =>
  new Headers({
    "x-ewatrade-client": "mobile",
    "x-ewatrade-analytics": "allowed",
  })
function turn(
  overrides: Partial<AssistantEventInput> = {},
): AssistantEventInput {
  return {
    name: "assistant_turn_completed",
    channel: "web",
    headers: webHeaders(),
    principal: {
      userId: "private-user-id",
      email: "private@example.com",
      tenantId: "private-tenant",
      tenantName: "Business",
      role: "OWNER",
      internal: false,
    },
    key: "run:private-run-id",
    details: {
      input_kind: "voice",
      step_count: 3,
      provider: "openai",
      model: "gpt-5.1-mini",
      duration_ms: 1840,
    },
    ...overrides,
  }
}
function required(input: AssistantEventInput) {
  const event = createAssistantEvent(input)
  if (!event) throw new Error("Expected an assistant event")
  return event
}

test("web and mobile turns carry assistant_channel, pseudonyms and fixed properties only", () => {
  const web = required(turn())
  expect(web).toMatchObject({
    project: "ewatrade-dashboard",
    name: "assistant_turn_completed",
    source: "server",
    properties: {
      surface: "assistant",
      category: "turn",
      status: "completed",
      success: true,
      channel: "server",
      assistant_channel: "web",
      input_kind: "voice",
      step_count: 3,
      provider: "openai",
      model: "gpt-5.1-mini",
      duration_ms: 1840,
      audience: "business",
      workspace_role: "OWNER",
      environment: "production",
    },
  })
  expect(web.actorId).toMatch(/^usr_[a-f0-9]{64}$/)
  expect(web.groups.business?.key).toMatch(/^grp_[a-f0-9]{64}$/)
  const mobile = required(turn({ channel: "mobile", headers: mobileHeaders() }))
  expect(mobile.properties.assistant_channel).toBe("mobile")
})

test("payloads never contain message text, phone numbers, Telegram ids, emails or raw ids", () => {
  const event = required(
    turn({
      name: "assistant_action_proposed",
      key: "proposal:private-proposal:1",
      details: {
        // Free text and identifiers do not fit the fixed vocabulary.
        action: "Sell 5 bags to +2348031234567" as never,
        error_code: "telegram 123456789" as never,
        model: "gpt-5.1-mini",
        ...({ message: "hello", phone: "+2348031234567" } as object),
      },
    }),
  )
  const serialized = JSON.stringify(event)
  for (const value of [
    "private-user-id",
    "private-tenant",
    "private-run-id",
    "private-proposal",
    "private@example.com",
    "+2348031234567",
    "123456789",
    "hello",
    "Sell",
  ])
    expect(serialized).not.toContain(value)
  expect(event.properties.action).toBeUndefined()
  expect(event.properties.model).toBe("gpt-5.1-mini")
})

test("webhook retries and repeated decisions share one event id per source and name", () => {
  const first = required(turn())
  expect(required(turn()).eventId).toBe(first.eventId)
  expect(required(turn({ details: { step_count: 9 } })).eventId).toBe(
    first.eventId,
  )
  expect(required(turn({ name: "assistant_turn_failed" })).eventId).not.toBe(
    first.eventId,
  )
  expect(required(turn({ key: "run:other" })).eventId).not.toBe(first.eventId)
})

test("WhatsApp and Telegram fail closed: no stored consent basis exists", () => {
  for (const channel of ["whatsapp", "telegram"] as const)
    expect(
      createAssistantEvent(turn({ channel, headers: webHeaders() })),
    ).toBeNull()
})

test("collection needs flags, consent header, matching client and non-QA principal", () => {
  const request = turn()
  for (const headers of [
    new Headers({
      origin: "https://dash.ewatrade.com",
      "x-ewatrade-client": "web",
      "x-ewatrade-analytics": "denied",
    }),
    new Headers({
      origin: "https://evil.example",
      "x-ewatrade-client": "web",
      "x-ewatrade-analytics": "allowed",
    }),
    new Headers({
      origin: "https://dash.ewatrade.com",
      "x-ewatrade-client": "mobile",
      "x-ewatrade-analytics": "allowed",
    }),
  ])
    expect(createAssistantEvent({ ...request, headers })).toBeNull()
  expect(
    createAssistantEvent({
      ...request,
      channel: "mobile",
      headers: new Headers({
        "x-ewatrade-client": "mobile",
        "x-ewatrade-analytics": "denied",
      }),
    }),
  ).toBeNull()
  expect(
    createAssistantEvent({
      ...request,
      channel: "mobile",
      headers: new Headers({ "x-ewatrade-analytics": "allowed" }),
    }),
  ).toBeNull()
  for (const principal of [
    { ...request.principal, qaSession: true },
    { ...request.principal, dataClassification: "QA" },
    { ...request.principal, email: "tester@qa.example.test" },
  ]) {
    expect(createAssistantEvent({ ...request, principal })).toBeNull()
    expect(
      createAssistantEvent({
        ...request,
        principal,
        channel: "mobile",
        headers: mobileHeaders(),
      }),
    ).toBeNull()
  }
  process.env.LOGLY_ASSISTANT_EVENTS_ENABLED = "false"
  expect(createAssistantEvent(request)).toBeNull()
  expect(assistantCaptureAllowed(request)).toBe(false)
  process.env.LOGLY_ASSISTANT_EVENTS_ENABLED = "true"
  process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED = "false"
  expect(createAssistantEvent(request)).toBeNull()
  process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED = "true"
  process.env.LOGLY_IDENTITY_SECRET = ""
  expect(createAssistantEvent(request)).toBeNull()
})

test("client header is analytics-only: missing means web, unknown drops", () => {
  expect(assistantClientChannel(new Headers())).toBe("web")
  expect(
    assistantClientChannel(new Headers({ "x-ewatrade-client": "mobile" })),
  ).toBe("mobile")
  expect(
    assistantClientChannel(new Headers({ "x-ewatrade-client": "whatsapp" })),
  ).toBeNull()
})

test("unsuccessful statuses are marked unsuccessful", () => {
  for (const [name, success] of [
    ["assistant_turn_failed", false],
    ["assistant_turn_blocked", false],
    ["assistant_action_expired", false],
    ["assistant_action_failed", false],
    ["assistant_action_executed", true],
    ["assistant_channel_link_revoked", true],
  ] as const)
    expect(required(turn({ name })).properties.success).toBe(success)
})

test("delivery sends assistant envelopes and drops queued ones once the flag is off", async () => {
  const event = required(
    turn({
      name: "assistant_turn_blocked",
      details: { block_reason: "quota", error_code: "BUDGET_EXHAUSTED" },
    }),
  )
  const sent: string[] = []
  const send = (async (_url: string, init?: RequestInit) => {
    sent.push(String(init?.body))
    return new Response(null, { status: 202 })
  }) as typeof fetch
  await deliverDashboardOutcome(event, send)
  expect(sent).toHaveLength(1)
  expect(JSON.parse(sent[0] ?? "{}").events[0].name).toBe(
    "assistant_turn_blocked",
  )
  process.env.LOGLY_ASSISTANT_EVENTS_ENABLED = "false"
  await deliverDashboardOutcome(event, send)
  expect(sent).toHaveLength(1)
})
