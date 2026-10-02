import { describe, expect, it } from "bun:test"
import {
  ExpenseReceiptReadGeneration,
  associateExpenseReceiptIntentAsset,
  canAttachExpenseReceipt,
  canDownloadExpenseReceipt,
  clearExpenseReceiptCommandId,
  clearExpenseReceiptIntentForAsset,
  expenseReceiptStatus,
  getExpenseReceiptCommandId,
  getExpenseReceiptIntentAsset,
  isExpenseReceiptReadCurrent,
  validateExpenseReceiptFile,
} from "./expense-receipt-state"

class MemoryStorage {
  #values = new Map<string, string>()

  getItem(key: string) {
    return this.#values.get(key) ?? null
  }

  get length() {
    return this.#values.size
  }

  key(index: number) {
    return [...this.#values.keys()][index] ?? null
  }

  setItem(key: string, value: string) {
    this.#values.set(key, value)
  }

  removeItem(key: string) {
    this.#values.delete(key)
  }
}

describe("expense receipt client rules", () => {
  it("rejects the actual page promise across offline/reconnect and superseding reads", async () => {
    const reads = new ExpenseReceiptReadGeneration()
    let finish: ((value: string) => void) | undefined
    const promise = new Promise<string>((resolve) => {
      finish = resolve
    })
    const request = reads.begin(100)
    const page = reads.read(
      request,
      () => promise,
      () => true,
    )
    reads.invalidate()
    const current = reads.begin(101)
    finish?.("obsolete private metadata")
    await expect(page).rejects.toThrow("access changed")
    expect(reads.accepts(request, 102)).toBe(false)
    expect(
      await reads.read(
        current,
        async () => "current page",
        () => true,
      ),
    ).toBe("current page")
    const newer = reads.begin(103)
    expect(reads.accepts(current, 104)).toBe(false)
    expect(reads.accepts(newer, 104)).toBe(true)
  })

  it("rechecks current scope after response and refuses reads before network work", async () => {
    const reads = new ExpenseReceiptReadGeneration()
    let current = true
    const request = reads.begin(100)
    await expect(
      reads.read(
        request,
        async () => {
          current = false
          return "private page"
        },
        () => current,
      ),
    ).rejects.toThrow("access changed")
    let contacted = false
    await expect(
      reads.read(
        reads.begin(101),
        async () => {
          contacted = true
          return "page"
        },
        () => false,
      ),
    ).rejects.toThrow("access changed")
    expect(contacted).toBe(false)
  })

  it("accepts only supported, bounded original files", () => {
    expect(
      validateExpenseReceiptFile({ type: "application/pdf", size: 1 }),
    ).toBeNull()
    expect(
      validateExpenseReceiptFile({ type: "image/heif", size: 10_000_000 }),
    ).toBeNull()
    expect(
      validateExpenseReceiptFile({ type: "image/svg+xml", size: 20 }),
    ).toContain("JPEG, PNG")
    expect(
      validateExpenseReceiptFile({ type: "image/png", size: 0 }),
    ).toContain("between 1 byte")
    expect(
      validateExpenseReceiptFile({ type: "image/png", size: 10_000_001 }),
    ).toContain("between 1 byte")
    expect(
      validateExpenseReceiptFile({
        type: "application/pdf",
        size: 10,
        name: "../receipt.pdf",
      }),
    ).toContain("valid file name")
  })

  it("requires fresh verified server clearance before attaching", () => {
    expect(
      canAttachExpenseReceipt({
        uploadState: "VERIFIED",
        safetyState: "QUARANTINED",
        attachmentState: "UNATTACHED",
        bytesDeletedAt: null,
      }),
    ).toBe(false)
    expect(
      canAttachExpenseReceipt({
        uploadState: "VERIFIED",
        safetyState: "SAFE",
        attachmentState: "UNATTACHED",
        bytesDeletedAt: null,
      }),
    ).toBe(true)
    expect(
      canAttachExpenseReceipt({
        uploadState: "VERIFIED",
        safetyState: "SAFE",
        attachmentState: "UNATTACHED",
        bytesDeletedAt: new Date(),
      }),
    ).toBe(false)
  })

  it("keeps withdrawn evidence visibly retained and unavailable for download", () => {
    const withdrawn = {
      uploadState: "VERIFIED",
      safetyState: "SAFE",
      attachmentState: "WITHDRAWN",
      bytesDeletedAt: null,
    }
    expect(expenseReceiptStatus(withdrawn)).toBe("Withdrawn · retained")
    expect(canDownloadExpenseReceipt(withdrawn)).toBe(false)
    expect(
      canDownloadExpenseReceipt({ ...withdrawn, attachmentState: "ATTACHED" }),
    ).toBe(true)
    expect(
      canDownloadExpenseReceipt({
        ...withdrawn,
        attachmentState: "ATTACHED",
        safetyState: "QUARANTINED",
      }),
    ).toBe(false)
    expect(
      canDownloadExpenseReceipt({
        ...withdrawn,
        attachmentState: "ATTACHED",
        bytesDeletedAt: new Date(),
      }),
    ).toBe(false)
  })

  it("recovers stable command IDs per actor, tenant, bill, and original identity", () => {
    const storage = new MemoryStorage()
    const scope = {
      actorUserId: "actor-a",
      tenantId: "tenant-a",
      bookId: "book-a",
      billId: "expense-a",
    }
    let issued = 0
    const nextId = () => `command-${++issued}`
    const first = getExpenseReceiptCommandId(
      storage,
      scope,
      "intent",
      "digest-a",
      nextId,
    )
    expect(
      getExpenseReceiptCommandId(storage, scope, "intent", "digest-a", nextId),
    ).toBe(first)
    expect(
      getExpenseReceiptCommandId(
        storage,
        { ...scope, billId: "expense-b" },
        "intent",
        "digest-a",
        nextId,
      ),
    ).not.toBe(first)
    expect(
      getExpenseReceiptCommandId(storage, scope, "intent", "digest-b", nextId),
    ).not.toBe(first)
    expect(
      getExpenseReceiptCommandId(
        storage,
        { ...scope, tenantId: "tenant-b" },
        "intent",
        "digest-a",
        nextId,
      ),
    ).not.toBe(first)
    expect(
      getExpenseReceiptCommandId(
        storage,
        { ...scope, actorUserId: "actor-b" },
        "intent",
        "digest-a",
        nextId,
      ),
    ).not.toBe(first)
    expect(
      getExpenseReceiptCommandId(storage, scope, "attach", "asset-a", nextId),
    ).not.toBe(first)
    clearExpenseReceiptCommandId(storage, scope, "intent", "digest-a")
    expect(
      getExpenseReceiptCommandId(storage, scope, "intent", "digest-a", nextId),
    ).not.toBe(first)
  })

  it("hides receipt metadata until the scoped read is current and online", () => {
    const current = {
      online: true,
      fetchedAfterMount: true,
      fetchStatus: "idle" as const,
      isFetching: false,
      isError: false,
      requestCurrent: true,
    }
    expect(isExpenseReceiptReadCurrent(current)).toBe(true)
    expect(isExpenseReceiptReadCurrent({ ...current, online: false })).toBe(
      false,
    )
    expect(
      isExpenseReceiptReadCurrent({ ...current, fetchStatus: "paused" }),
    ).toBe(false)
    expect(
      isExpenseReceiptReadCurrent({
        ...current,
        fetchStatus: "fetching",
        isFetching: true,
      }),
    ).toBe(false)
    expect(isExpenseReceiptReadCurrent({ ...current, isError: true })).toBe(
      false,
    )
    expect(
      isExpenseReceiptReadCurrent({ ...current, requestCurrent: false }),
    ).toBe(false)
    expect(
      isExpenseReceiptReadCurrent({ ...current, fetchedAfterMount: false }),
    ).toBe(false)
  })

  it("rejects receipt reads that finish after a blocked transition", () => {
    const reads = new ExpenseReceiptReadGeneration()
    const first = reads.begin(100)
    reads.invalidate()
    expect(reads.accepts(first, 101)).toBe(false)
    const afterReconnect = reads.begin(101)
    expect(reads.accepts(afterReconnect, 102)).toBe(true)
    reads.invalidate()
    expect(reads.accepts(afterReconnect, 103)).toBe(false)
  })

  it("clears an intent recovery link after fresh attachment confirmation", () => {
    const storage = new MemoryStorage()
    const scope = {
      actorUserId: "actor-a",
      tenantId: "tenant-a",
      bookId: "book-a",
      billId: "expense-a",
    }
    getExpenseReceiptCommandId(
      storage,
      scope,
      "intent",
      "identity-a",
      () => "command-a",
    )
    associateExpenseReceiptIntentAsset(storage, scope, "identity-a", "asset-a")
    expect(storage.length).toBe(2)
    expect(getExpenseReceiptIntentAsset(storage, scope, "identity-a")).toBe(
      "asset-a",
    )
    clearExpenseReceiptIntentForAsset(storage, scope, "asset-a")
    expect(
      getExpenseReceiptIntentAsset(storage, scope, "identity-a"),
    ).toBeNull()
    expect(storage.length).toBe(0)
  })
})
