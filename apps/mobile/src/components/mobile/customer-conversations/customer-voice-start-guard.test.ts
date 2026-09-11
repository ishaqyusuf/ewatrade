import { describe, expect, test } from "bun:test"

import { isCustomerVoiceStartCurrent } from "./customer-voice-start-guard"

describe("isCustomerVoiceStartCurrent", () => {
  const attempt = { generation: 4, scopeKey: "conversation-a" }

  test("keeps only the current active enabled attempt", () => {
    expect(
      isCustomerVoiceStartCurrent(attempt, {
        appState: "active",
        enabled: true,
        generation: 4,
        scopeKey: "conversation-a",
      }),
    ).toBe(true)
  })

  test("invalidates cancelled, backgrounded, disabled, and changed-scope starts", () => {
    expect(
      isCustomerVoiceStartCurrent(attempt, {
        appState: "active",
        enabled: true,
        generation: 5,
        scopeKey: "conversation-a",
      }),
    ).toBe(false)
    expect(
      isCustomerVoiceStartCurrent(attempt, {
        appState: "background",
        enabled: true,
        generation: 4,
        scopeKey: "conversation-a",
      }),
    ).toBe(false)
    expect(
      isCustomerVoiceStartCurrent(attempt, {
        appState: "active",
        enabled: false,
        generation: 4,
        scopeKey: "conversation-a",
      }),
    ).toBe(false)
    expect(
      isCustomerVoiceStartCurrent(attempt, {
        appState: "active",
        enabled: true,
        generation: 4,
        scopeKey: "conversation-b",
      }),
    ).toBe(false)
  })
})
