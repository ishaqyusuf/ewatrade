import { describe, expect, test } from "bun:test"

import {
  bootstrapNewStoreEntryWithCredentialRecovery,
  canRetryNewStoreEntryAfterCredentialRejection,
  completePendingCustomerTransfer,
  isCustomerCredentialError,
  isDefinitiveCustomerTransferError,
  mergeCustomerConversationPages,
  resolveCustomerConversationRetryTarget,
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

  test("starts a fresh guest only when a different direct Store link rejects the old credential", () => {
    const input = {
      accountAccess: false,
      error: { data: { code: "UNAUTHORIZED" } },
      previousSession: {
        lastConversation: { publicToken: "previous-store" },
      },
      publicToken: "new-store",
      transferToken: null,
    }
    expect(canRetryNewStoreEntryAfterCredentialRejection(input)).toBe(true)
    expect(
      canRetryNewStoreEntryAfterCredentialRejection({
        ...input,
        publicToken: "previous-store",
      }),
    ).toBe(false)
    expect(
      canRetryNewStoreEntryAfterCredentialRejection({
        ...input,
        transferToken: "web-transfer",
      }),
    ).toBe(false)
    expect(
      canRetryNewStoreEntryAfterCredentialRejection({
        ...input,
        accountAccess: true,
      }),
    ).toBe(false)
    expect(
      canRetryNewStoreEntryAfterCredentialRejection({
        ...input,
        previousSession: null,
      }),
    ).toBe(false)
    expect(
      canRetryNewStoreEntryAfterCredentialRejection({
        ...input,
        error: { data: { code: "NOT_FOUND" } },
      }),
    ).toBe(false)
  })

  test("waits for local credential removal before one fresh bootstrap", async () => {
    const calls: string[] = []
    let attempts = 0
    const result = await bootstrapNewStoreEntryWithCredentialRecovery({
      accountAccess: false,
      bootstrap: async () => {
        attempts += 1
        calls.push(`bootstrap-${attempts}`)
        if (attempts === 1) {
          throw { data: { code: "UNAUTHORIZED" } }
        }
        return "new-conversation"
      },
      clearSession: async () => {
        calls.push("clear-start")
        await Promise.resolve()
        calls.push("clear-finished")
      },
      previousSession: {
        lastConversation: { publicToken: "previous-store" },
      },
      publicToken: "new-store",
      transferToken: null,
    })
    expect(result).toBe("new-conversation")
    expect(calls).toEqual([
      "bootstrap-1",
      "clear-start",
      "clear-finished",
      "bootstrap-2",
    ])
  })

  test("does not replace same-Store access or retry repeatedly", async () => {
    const rejection = { data: { code: "UNAUTHORIZED" } }
    let attempts = 0
    let clears = 0
    const input = {
      accountAccess: false,
      bootstrap: async () => {
        attempts += 1
        throw rejection
      },
      clearSession: async () => {
        clears += 1
      },
      previousSession: {
        lastConversation: { publicToken: "previous-store" },
      },
      publicToken: "previous-store",
      transferToken: null,
    }
    await expect(
      bootstrapNewStoreEntryWithCredentialRecovery(input),
    ).rejects.toBe(rejection)
    expect(attempts).toBe(1)
    expect(clears).toBe(0)
    await expect(
      bootstrapNewStoreEntryWithCredentialRecovery({
        ...input,
        publicToken: "new-store",
      }),
    ).rejects.toBe(rejection)
    expect(attempts).toBe(3)
    expect(clears).toBe(1)
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

  test("retries the failed timeline after Store-link bootstrap succeeds", () => {
    expect(
      resolveCustomerConversationRetryTarget({
        conversationId: "conversation_1",
        timelineFailed: true,
      }),
    ).toBe("timeline")
    expect(
      resolveCustomerConversationRetryTarget({
        conversationId: null,
        timelineFailed: true,
      }),
    ).toBe("bootstrap")
  })
})
