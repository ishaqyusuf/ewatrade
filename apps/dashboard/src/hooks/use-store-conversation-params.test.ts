import { describe, expect, test } from "bun:test"

import {
  getStoreConversationFilterUpdate,
  getStoreConversationQueueInput,
  loadStoreConversationParams,
} from "./use-store-conversation-params"

describe("Store conversation URL state", () => {
  test("clears pagination for filters and preserves an explicit next cursor", () => {
    expect(getStoreConversationFilterUpdate({ assignment: "mine" })).toEqual({
      assignment: "mine",
      cursor: null,
    })
    expect(getStoreConversationFilterUpdate({ cursor: "next-page" })).toEqual({
      cursor: "next-page",
    })
  })

  test("loads allowlisted state and builds a bounded queue input", () => {
    const params = loadStoreConversationParams({
      assignment: "mine",
      conversationId: "conversation_1",
      conversationSheet: "detail",
      cursor: "next-page",
      direction: "asc",
      q: "conversation-reference",
      requestKinds: "commerce_inquiry,unsafe_kind",
      sla: "overdue",
      sort: "response_due_at",
      store: "store_1",
    })

    expect(params.conversationId).toBe("conversation_1")
    expect(params.conversationSheet).toBe("detail")

    expect(getStoreConversationQueueInput(params, "fallback_store")).toEqual({
      assignment: "mine",
      cursor: "next-page",
      pageSize: 25,
      q: "conversation-reference",
      requestKinds: ["commerce_inquiry"],
      sla: "overdue",
      sort: ["response_due_at", "asc"],
      storeId: "store_1",
    })
  })
})
