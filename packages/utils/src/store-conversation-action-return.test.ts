import { describe, expect, test } from "bun:test"

import { advanceStoreConversationActionReturn } from "./store-conversation-action-return"

describe("Store Conversation action return", () => {
  test("refreshes only after an armed external handoff returns", () => {
    expect(advanceStoreConversationActionReturn("idle", "active")).toEqual({
      refresh: false,
      state: "idle",
    })

    const armed = advanceStoreConversationActionReturn("idle", "handoff_opened")
    expect(armed).toEqual({ refresh: false, state: "armed" })

    const away = advanceStoreConversationActionReturn(armed.state, "inactive")
    expect(away).toEqual({ refresh: false, state: "away" })
    expect(advanceStoreConversationActionReturn(away.state, "active")).toEqual({
      refresh: true,
      state: "idle",
    })
  })

  test("supports browser page restoration without an observable hidden event", () => {
    const armed = advanceStoreConversationActionReturn("idle", "handoff_opened")

    expect(advanceStoreConversationActionReturn(armed.state, "active")).toEqual(
      {
        refresh: true,
        state: "idle",
      },
    )
  })

  test("does not repeatedly refresh after one return", () => {
    expect(advanceStoreConversationActionReturn("away", "active")).toEqual({
      refresh: true,
      state: "idle",
    })
    expect(advanceStoreConversationActionReturn("idle", "active")).toEqual({
      refresh: false,
      state: "idle",
    })
  })
})
