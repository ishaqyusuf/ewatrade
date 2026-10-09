import { expect, test } from "bun:test"
import {
  assistantRequestHeaders,
  assistantScopeKey,
  isAssistantSessionCurrent,
} from "./assistant-scope"
const session = {
  token: "test-token",
  profile: {
    id: "owner",
    name: "Owner",
    email: "owner@example.test",
    businessId: "business",
    businessSlug: "business",
    storeId: "store",
    role: "OWNER",
  },
}
test("stops assistant work on session, store, offline or authority changes", () => {
  expect(isAssistantSessionCurrent(session, session, false)).toBe(true)
  for (const current of [
    null,
    { ...session, token: "other" },
    { ...session, profile: { ...session.profile, storeId: "other" } },
    { ...session, profile: { ...session.profile, role: "OPERATOR" } },
    { ...session, profile: { ...session.profile, status: "SUSPENDED" } },
  ])
    expect(isAssistantSessionCurrent(session, current, false)).toBe(false)
  expect(isAssistantSessionCurrent(session, session, true)).toBe(false)
  expect(
    isAssistantSessionCurrent(
      { ...session, token: "local-demo" },
      { ...session, token: "local-demo" },
      false,
    ),
  ).toBe(false)
  expect(assistantScopeKey(session)).not.toContain(session.token)
})
test("native streaming sends the active tenant and Store with Bearer authentication", () => {
  expect(assistantRequestHeaders(session)).toMatchObject({
    Authorization: "Bearer test-token",
    "x-store-id": "store",
    "x-tenant-slug": "business",
  })
})
