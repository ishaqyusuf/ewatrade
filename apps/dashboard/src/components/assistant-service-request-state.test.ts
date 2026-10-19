import { expect, test } from "bun:test"
import {
  assistantServiceRequestCloseParams,
  assistantServiceRequestOpenParams,
  assistantServiceRequestReadState,
  parseAssistantServiceRequest,
} from "./assistant-service-request-state"

const target = {
  kind: "service_request" as const,
  requestId: "request-1",
  origin: { tenantId: "business-1", storeId: "store-1" },
}
const scopeKey = JSON.stringify(["actor-1", "business-1", "store-1"])
const data = {
  actorUserId: "actor-1",
  tenantId: "business-1",
  storeId: "store-1",
  request: { id: "request-1" },
}
const ready = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  isFetchedAfterMount: true,
  data,
}

test("URL keeps the exact request and origin; Close clears only its own parameter", () => {
  const opened = assistantServiceRequestOpenParams(target)
  expect(parseAssistantServiceRequest(opened.assistantServiceRequest)).toEqual(
    target,
  )
  for (const raw of [
    null,
    "",
    "nope",
    "{}",
    JSON.stringify({ ...target, kind: "inquiry" }),
    JSON.stringify({ ...target, requestId: "" }),
    JSON.stringify({ ...target, requestId: "r".repeat(129) }),
    JSON.stringify({ ...target, origin: { tenantId: "b" } }),
    JSON.stringify({ ...target, scope: "override" }),
  ])
    expect(parseAssistantServiceRequest(raw)).toBeNull()
  const workspace = {
    conversationId: "saved-chat",
    assistantDraft: "unsent",
    assistantBooking: null,
    ...opened,
  }
  expect({ ...workspace, ...assistantServiceRequestCloseParams }).toEqual({
    ...workspace,
    assistantServiceRequest: null,
  })
  expect(Object.keys(assistantServiceRequestCloseParams)).toEqual([
    "assistantServiceRequest",
  ])
})

test("pending, fetching, paused and pre-mount cached reads never reveal the request", () => {
  expect(assistantServiceRequestReadState(target, scopeKey, ready)).toBe(
    "ready",
  )
  for (const field of ["isPending", "isFetching", "isPaused"] as const)
    expect(
      assistantServiceRequestReadState(target, scopeKey, {
        ...ready,
        [field]: true,
      }),
    ).toBe("loading")
  expect(
    assistantServiceRequestReadState(target, scopeKey, {
      ...ready,
      isFetchedAfterMount: false,
    }),
  ).toBe("loading")
  expect(
    assistantServiceRequestReadState(target, scopeKey, {
      ...ready,
      isError: true,
    }),
  ).toBe("unavailable")
})

test("a different origin, current scope or returned record is withheld, including after a scope change", () => {
  for (const origin of [
    { tenantId: "other-business", storeId: "store-1" },
    { tenantId: "business-1", storeId: "other-store" },
  ])
    expect(
      assistantServiceRequestReadState({ ...target, origin }, scopeKey, ready),
    ).toBe("unavailable")
  for (const scope of [
    ["other-actor", "business-1", "store-1"],
    ["actor-1", "other-business", "store-1"],
    ["actor-1", "business-1", "other-store"],
  ])
    expect(
      assistantServiceRequestReadState(target, JSON.stringify(scope), ready),
    ).toBe("unavailable")
  for (const changed of [
    { ...data, actorUserId: "x" },
    { ...data, tenantId: "x" },
    { ...data, storeId: "x" },
    { ...data, request: { id: "other-request" } },
  ])
    expect(
      assistantServiceRequestReadState(target, scopeKey, {
        ...ready,
        data: changed,
      }),
    ).toBe("unavailable")
  for (const raw of ["", "[]", JSON.stringify(["actor-1", "business-1"])])
    expect(assistantServiceRequestReadState(target, raw, ready)).toBe(
      "unavailable",
    )
})
