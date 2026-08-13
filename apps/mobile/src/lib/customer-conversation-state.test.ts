import { describe, expect, test } from "bun:test"

import {
  completePendingCustomerTransfer,
  isCustomerCredentialError,
  isDefinitiveCustomerTransferError,
  mergeCustomerConversationPages,
  resolveCustomerOperation,
} from "./customer-conversation-state"

describe("customer conversation state", () => {
  test("merges refreshed pages without duplicate conversations", () => {
    expect(
      mergeCustomerConversationPages(
        [{ conversationId: "first" }, { conversationId: "second" }],
        [{ conversationId: "second" }, { conversationId: "third" }],
      ),
    ).toEqual([
      { conversationId: "first" },
      { conversationId: "second" },
      { conversationId: "third" },
    ])
  })

  test("keeps an operation id for retry and rotates when intent changes", () => {
    const first = resolveCustomerOperation(null, "send:hello", () => "op-1")
    expect(resolveCustomerOperation(first, "send:hello", () => "op-2")).toBe(
      first,
    )
    expect(
      resolveCustomerOperation(first, "send:different", () => "op-2"),
    ).toEqual({ id: "op-2", key: "send:different" })
  })

  test("recognizes only the typed customer credential failure", () => {
    expect(isCustomerCredentialError({ data: { code: "UNAUTHORIZED" } })).toBe(
      true,
    )
    expect(isCustomerCredentialError({ data: { code: "CONFLICT" } })).toBe(
      false,
    )
    expect(isCustomerCredentialError(new Error("UNAUTHORIZED"))).toBe(false)
  })

  test("keeps interrupted transfers but discards definitive server rejection", () => {
    expect(isDefinitiveCustomerTransferError(new Error("offline"))).toBe(false)
    expect(
      isDefinitiveCustomerTransferError({ data: { code: "NOT_FOUND" } }),
    ).toBe(true)
  })

  test("reuses the same target credential across transfer retries", () => {
    const pending = completePendingCustomerTransfer(
      { publicToken: "store", transferToken: "transfer" },
      () => "candidate-one",
    )
    expect(
      completePendingCustomerTransfer(pending, () => "candidate-two"),
    ).toBe(pending)
    expect(pending.targetCredentialToken).toBe("candidate-one")
  })
})
