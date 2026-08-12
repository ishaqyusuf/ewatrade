import { describe, expect, test } from "bun:test"

import {
  prependOlderStoreConversationMessages,
  resolveStoreConversationKeyedOperation,
  resolveStoreConversationOperationId,
  storeConversationRequestSelectionKey,
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

  test("retains a Request-selection identity only for the same target", () => {
    let created = 0
    const create = () => `selection_${++created}`
    const newProductKey = storeConversationRequestSelectionKey("message_1", {
      kind: "new_commerce_inquiry",
    })
    const existingServiceKey = storeConversationRequestSelectionKey(
      "message_1",
      {
        kind: "existing_request",
        requestId: "request_2",
        requestKind: "service_request",
      },
    )
    const first = resolveStoreConversationKeyedOperation(
      null,
      newProductKey,
      create,
    )
    const retry = resolveStoreConversationKeyedOperation(
      first,
      newProductKey,
      create,
    )
    const changedTarget = resolveStoreConversationKeyedOperation(
      retry,
      existingServiceKey,
      create,
    )

    expect(newProductKey).toBe("message_1:new_commerce_inquiry")
    expect(existingServiceKey).toBe(
      "message_1:existing_request:service_request:request_2",
    )
    expect(retry).toEqual(first)
    expect(changedTarget.id).not.toBe(first.id)
    expect(created).toBe(2)
  })

  test("prepends bounded older pages without reordering the current page", () => {
    expect(prependOlderStoreConversationMessages([3, 4], [1, 2])).toEqual([
      1, 2, 3, 4,
    ])
  })
})
