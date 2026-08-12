import { describe, expect, test } from "bun:test"

import {
  prependOlderStoreConversationMessages,
  resolveStoreConversationOperationId,
} from "./store-conversation-client-state"

describe("Store Conversation client state", () => {
  test("retains one command identity across a failed-response retry", () => {
    let created = 0
    const create = () => `operation_${++created}`
    const first = resolveStoreConversationOperationId(null, create)
    const retry = resolveStoreConversationOperationId(first, create)

    expect(retry).toBe(first)
    expect(created).toBe(1)
    expect(resolveStoreConversationOperationId(null, create)).not.toBe(first)
  })

  test("prepends bounded older pages without reordering the current page", () => {
    expect(prependOlderStoreConversationMessages([3, 4], [1, 2])).toEqual([
      1, 2, 3, 4,
    ])
  })
})
