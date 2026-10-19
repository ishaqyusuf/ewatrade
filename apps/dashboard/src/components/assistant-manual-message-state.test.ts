import { expect, test } from "bun:test"
import {
  assistantManualMessageCloseParams,
  assistantManualMessageOpenParams,
  assistantManualMessageReadState,
  parseAssistantManualMessage,
  parseAssistantObjectScope,
} from "./assistant-manual-message-state"

const target = {
  kind: "service_manual_message" as const,
  jobId: "job-1",
  intentId: "intent-1",
  shareId: "share-1",
}
const scopeKey = JSON.stringify(["actor-1", "business-1", "store-1"])
function record() {
  return {
    actorUserId: "actor-1",
    tenantId: "business-1",
    storeId: "store-1",
    job: { id: "job-1" },
    intent: {
      id: "intent-1",
      channel: "MANUAL",
      status: "COMPLETED",
      purpose: "assistant_manual_share",
    },
    share: { id: "share-1" },
    kind: "staff_reported_share",
    sending: "none",
    delivery: "unverified",
  }
}
const ready = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  isFetchedAfterMount: true,
  data: record(),
}

test("URL keeps the exact Job/message/share tuple; Close clears only its own parameter", () => {
  const opened = assistantManualMessageOpenParams(target)
  expect(parseAssistantManualMessage(opened.assistantManualMessage)).toEqual(
    target,
  )
  for (const raw of [
    null,
    "",
    "not-json",
    "{}",
    JSON.stringify({ ...target, shareId: "" }),
    JSON.stringify({ ...target, kind: "order" }),
    JSON.stringify({ ...target, tenantId: "spoofed" }),
    JSON.stringify({ ...target, jobId: "j".repeat(129) }),
  ])
    expect(parseAssistantManualMessage(raw)).toBeNull()
  const workspace = {
    conversationId: "saved-chat",
    assistantDraft: "unsent",
    ...opened,
  }
  expect({ ...workspace, ...assistantManualMessageCloseParams }).toEqual({
    ...workspace,
    assistantManualMessage: null,
  })
  expect(Object.keys(assistantManualMessageCloseParams)).toEqual([
    "assistantManualMessage",
  ])
})

test("the scope key is identity-only [actor, business, Store]; anything else is refused", () => {
  expect(parseAssistantObjectScope(scopeKey)).toEqual({
    actorUserId: "actor-1",
    tenantId: "business-1",
    storeId: "store-1",
  })
  for (const raw of [
    "",
    "[]",
    JSON.stringify(["actor-1", "business-1"]),
    JSON.stringify(["actor-1", "business-1", ""]),
    JSON.stringify(["actor-1", "business-1", 3]),
    JSON.stringify({ actorUserId: "actor-1" }),
  ]) {
    expect(parseAssistantObjectScope(raw)).toBeNull()
    expect(assistantManualMessageReadState(target, raw, ready)).toBe(
      "unavailable",
    )
  }
})

test("pending, fetching, paused and pre-mount cached reads never reveal the message", () => {
  expect(assistantManualMessageReadState(target, scopeKey, ready)).toBe("ready")
  for (const field of ["isPending", "isFetching", "isPaused"] as const)
    expect(
      assistantManualMessageReadState(target, scopeKey, {
        ...ready,
        [field]: true,
      }),
    ).toBe("loading")
  expect(
    assistantManualMessageReadState(target, scopeKey, {
      ...ready,
      isFetchedAfterMount: false,
    }),
  ).toBe("loading")
  expect(
    assistantManualMessageReadState(target, scopeKey, {
      ...ready,
      isError: true,
    }),
  ).toBe("unavailable")
})

test("cached facts from another actor, business or Store are withheld, including after a scope change", () => {
  for (const scope of [
    ["other-actor", "business-1", "store-1"],
    ["actor-1", "other-business", "store-1"],
    ["actor-1", "business-1", "other-store"],
  ])
    expect(
      assistantManualMessageReadState(target, JSON.stringify(scope), ready),
    ).toBe("unavailable")
  for (const field of ["actorUserId", "tenantId", "storeId"] as const)
    expect(
      assistantManualMessageReadState(target, scopeKey, {
        ...ready,
        data: { ...record(), [field]: "foreign" },
      }),
    ).toBe("unavailable")
})

test("only the exact staff-reported, unsent, unverified completed manual share is shown", () => {
  const variants: Array<(value: ReturnType<typeof record>) => unknown> = [
    (v) => ({ ...v, job: { id: "other-job" } }),
    (v) => ({ ...v, intent: { ...v.intent, id: "other-intent" } }),
    (v) => ({ ...v, share: { id: "other-share" } }),
    (v) => ({ ...v, kind: "provider_send" }),
    (v) => ({ ...v, sending: "queued" }),
    (v) => ({ ...v, delivery: "delivered" }),
    (v) => ({ ...v, intent: { ...v.intent, channel: "SMS" } }),
    (v) => ({ ...v, intent: { ...v.intent, status: "READY" } }),
    (v) => ({ ...v, intent: { ...v.intent, purpose: "service_ready" } }),
  ]
  for (const change of variants)
    expect(
      assistantManualMessageReadState(target, scopeKey, {
        ...ready,
        data: change(record()) as ReturnType<typeof record>,
      }),
    ).toBe("unavailable")
  expect(
    assistantManualMessageReadState(target, scopeKey, {
      ...ready,
      data: undefined,
    }),
  ).toBe("unavailable")
})
