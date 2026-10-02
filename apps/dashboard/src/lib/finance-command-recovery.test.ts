import { describe, expect, test } from "bun:test"
import {
  FinanceCommandLockUnavailableError,
  FinanceCommandRecoveryError,
  acknowledgeCommittedFinanceCommand,
  acknowledgeSupersededCashCommand,
  canDiscardFinanceRejection,
  clearPendingFinanceCommand,
  createPendingFinanceCommand,
  discardRejectedFinanceCommand,
  financeCommandStorageKey,
  hasRejectedFinanceCommandReceipt,
  matchesPendingFinanceCommand,
  readPendingFinanceCommand,
  rejectedFinanceCommandStorageKey,
  retainedFinanceCommandIsResolved,
  supersededCashCommandRecord,
  withFinanceCommandInspectionLock,
  withFinanceCommandLock,
  writePendingFinanceCommand,
} from "./finance-command-recovery"

class MemoryStorage {
  private values = new Map<string, string>()
  failRead = false
  failWrite = false
  failRemove = false

  getItem(key: string) {
    if (this.failRead) throw new Error("storage unavailable")
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error("storage full")
    this.values.set(key, value)
  }

  removeItem(key: string) {
    if (this.failRemove) throw new Error("remove unavailable")
    this.values.delete(key)
  }

  corrupt(key: string, value: string) {
    this.values.set(key, value)
  }
}

const scope = {
  actorUserId: "user-a",
  tenantId: "tenant-a",
  bookId: "book-a",
}

describe("finance command recovery metadata", () => {
  test("a sibling can verify a definitive rejection after its marker disappears", async () => {
    const storage = new MemoryStorage()
    const pending = await createPendingFinanceCommand(scope, {
      operation: "recordExpense",
      payload: { description: "private payee", amountMinor: 42 },
    })
    writePendingFinanceCommand(storage as unknown as Storage, pending)
    discardRejectedFinanceCommand(
      storage as unknown as Storage,
      scope,
      pending,
      {
        retryOfUncertainAttempt: false,
        status: "NOT_FOUND",
        errorCode: "BAD_REQUEST",
      },
    )
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope),
    ).toBe(null)
    expect(
      hasRejectedFinanceCommandReceipt(storage as unknown as Storage, pending),
    ).toBe(true)
    expect(
      storage.getItem(rejectedFinanceCommandStorageKey(pending)),
    ).not.toContain("private payee")
    expect(() =>
      hasRejectedFinanceCommandReceipt(storage as unknown as Storage, {
        ...pending,
        payloadDigest: "changed",
      }),
    ).toThrow(FinanceCommandRecoveryError)
    expect(
      hasRejectedFinanceCommandReceipt(storage as unknown as Storage, {
        ...pending,
        actorUserId: "other-actor",
      }),
    ).toBe(false)
    expect(
      hasRejectedFinanceCommandReceipt(storage as unknown as Storage, {
        ...pending,
        clientCommandId: "other-command",
      }),
    ).toBe(false)
  })
  test("rejection proof is saved before removal and never fabricated for an uncertain retry", async () => {
    const storage = new MemoryStorage()
    const pending = await createPendingFinanceCommand(scope, {
      operation: "recordMoney",
      payload: { amountMinor: 500 },
    })
    writePendingFinanceCommand(storage as unknown as Storage, pending)
    for (const evidence of [
      {
        retryOfUncertainAttempt: true,
        status: "NOT_FOUND" as const,
        errorCode: "CONFLICT",
      },
      {
        retryOfUncertainAttempt: false,
        status: "COMMITTED" as const,
        errorCode: "CONFLICT",
      },
      {
        retryOfUncertainAttempt: false,
        status: "NOT_FOUND" as const,
        errorCode: undefined,
      },
    ]) {
      expect(() =>
        discardRejectedFinanceCommand(
          storage as unknown as Storage,
          scope,
          pending,
          evidence,
        ),
      ).toThrow(FinanceCommandRecoveryError)
      expect(
        hasRejectedFinanceCommandReceipt(
          storage as unknown as Storage,
          pending,
        ),
      ).toBe(false)
    }
    storage.failWrite = true
    expect(() =>
      discardRejectedFinanceCommand(
        storage as unknown as Storage,
        scope,
        pending,
        {
          retryOfUncertainAttempt: false,
          status: "NOT_FOUND",
          errorCode: "CONFLICT",
        },
      ),
    ).toThrow(FinanceCommandRecoveryError)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope)
        ?.clientCommandId,
    ).toBe(pending.clientCommandId)
    storage.failWrite = false
    storage.failRemove = true
    expect(() =>
      discardRejectedFinanceCommand(
        storage as unknown as Storage,
        scope,
        pending,
        {
          retryOfUncertainAttempt: false,
          status: "NOT_FOUND",
          errorCode: "CONFLICT",
        },
      ),
    ).toThrow(FinanceCommandRecoveryError)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope)
        ?.clientCommandId,
    ).toBe(pending.clientCommandId)
    expect(
      hasRejectedFinanceCommandReceipt(storage as unknown as Storage, pending),
    ).toBe(true)
    storage.corrupt(rejectedFinanceCommandStorageKey(pending), "invalid")
    expect(() =>
      hasRejectedFinanceCommandReceipt(storage as unknown as Storage, pending),
    ).toThrow(FinanceCommandRecoveryError)
  })
  test("another tab's superseded acknowledgement resolves a retained identity without restoring its marker", async () => {
    const storage = new MemoryStorage()
    const retained = await createPendingFinanceCommand(scope, {
      operation: "cashAdjustmentReversal",
      payload: { entryId: "adjustment-a" },
      recoveryMetadata: { countId: "count-a", entryId: "adjustment-a" },
    })
    const source = {
      id: "count-a",
      adjustment: { id: "adjustment-a", reversal: { id: "reversal-b" } },
    }
    writePendingFinanceCommand(storage as unknown as Storage, retained)
    acknowledgeSupersededCashCommand(
      storage as unknown as Storage,
      scope,
      retained,
      source,
      "reversal-b",
    )
    const reads: string[] = []
    expect(
      await retainedFinanceCommandIsResolved(
        retained,
        "NOT_FOUND",
        async (bookId, countId) => {
          reads.push(`${bookId}:${countId}`)
          return source
        },
      ),
    ).toBe(true)
    expect(reads).toEqual(["book-a:count-a"])
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope),
    ).toBe(null)
    expect(
      await retainedFinanceCommandIsResolved(
        retained,
        "NOT_FOUND",
        async () => ({
          ...source,
          adjustment: {
            id: "other-adjustment",
            reversal: { id: "reversal-b" },
          },
        }),
      ),
    ).toBe(false)
    expect(
      await retainedFinanceCommandIsResolved(
        retained,
        "NOT_FOUND",
        async () => ({
          ...source,
          adjustment: { id: "adjustment-a", reversal: null },
        }),
      ),
    ).toBe(false)
    await expect(
      retainedFinanceCommandIsResolved(retained, "NOT_FOUND", async () => {
        throw new Error("offline")
      }),
    ).rejects.toThrow("offline")
  })
  test("missing markers and NOT_FOUND alone never resolve a retained finance attempt", async () => {
    const retained = await createPendingFinanceCommand(scope, {
      operation: "recordMoney",
      payload: { amountMinor: 500 },
      recoveryMetadata: { countId: "count-a" },
    })
    let sourceReads = 0
    const source = async () => {
      sourceReads++
      return { id: "count-a", adjustment: null }
    }
    expect(
      await retainedFinanceCommandIsResolved(retained, "NOT_FOUND", source),
    ).toBe(false)
    expect(await retainedFinanceCommandIsResolved(retained, null, source)).toBe(
      false,
    )
    expect(
      await retainedFinanceCommandIsResolved(retained, "COMMITTED", source),
    ).toBe(true)
    expect(sourceReads).toBe(0)
  })
  test("a superseded cash reversal resolves only against the exact immutable source", async () => {
    const storage = new MemoryStorage()
    const pending = await createPendingFinanceCommand(scope, {
      operation: "cashAdjustmentReversal",
      payload: { entryId: "adjustment-a" },
      recoveryMetadata: {
        entryId: "adjustment-a",
        countId: "count-a",
        expectedSnapshotSequence: "3",
      },
    })
    writePendingFinanceCommand(storage as unknown as Storage, pending)
    const source = {
      id: "count-a",
      adjustment: { id: "adjustment-a", reversal: { id: "other-reversal" } },
    }
    expect(supersededCashCommandRecord(pending, source)).toBe("other-reversal")
    expect(
      supersededCashCommandRecord(pending, { ...source, id: "count-b" }),
    ).toBe(null)
    expect(
      supersededCashCommandRecord(pending, {
        ...source,
        adjustment: { id: "different", reversal: { id: "other-reversal" } },
      }),
    ).toBe(null)
    expect(
      supersededCashCommandRecord(pending, {
        ...source,
        adjustment: { id: "adjustment-a", reversal: null },
      }),
    ).toBe(null)
    expect(
      supersededCashCommandRecord(
        { ...pending, operation: "recordMoney" },
        source,
      ),
    ).toBe(null)
    expect(() =>
      acknowledgeSupersededCashCommand(
        storage as unknown as Storage,
        scope,
        pending,
        source,
        "different-reversal",
      ),
    ).toThrow(FinanceCommandRecoveryError)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope)
        ?.clientCommandId,
    ).toBe(pending.clientCommandId)
    acknowledgeSupersededCashCommand(
      storage as unknown as Storage,
      scope,
      pending,
      source,
      "other-reversal",
    )
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope),
    ).toBe(null)
  })
  test("a rejected uncertain retry never discards an identity while its earlier request can commit", () => {
    for (const errorCode of [
      "BAD_REQUEST",
      "CONFLICT",
      "FORBIDDEN",
      "NOT_FOUND",
    ]) {
      expect(
        canDiscardFinanceRejection({
          retryOfUncertainAttempt: true,
          status: "NOT_FOUND",
          errorCode,
        }),
      ).toBe(false)
    }
    expect(
      canDiscardFinanceRejection({
        retryOfUncertainAttempt: false,
        status: "NOT_FOUND",
        errorCode: "BAD_REQUEST",
      }),
    ).toBe(true)
    expect(
      canDiscardFinanceRejection({
        retryOfUncertainAttempt: false,
        status: "COMMITTED",
        errorCode: "CONFLICT",
      }),
    ).toBe(false)
    expect(
      canDiscardFinanceRejection({
        retryOfUncertainAttempt: false,
        status: null,
        errorCode: "BAD_REQUEST",
      }),
    ).toBe(false)
    expect(
      canDiscardFinanceRejection({
        retryOfUncertainAttempt: false,
        status: "NOT_FOUND",
        errorCode: undefined,
      }),
    ).toBe(false)
  })
  test("reload reuses the exact identity only for the same operation and payload", async () => {
    const storage = new MemoryStorage()
    const payload = {
      bookId: scope.bookId,
      description: "private expense description",
      incurredAt: new Date("2026-10-01T00:00:00.000Z"),
      amountMinor: 12500,
    }
    const pending = await createPendingFinanceCommand(
      scope,
      { operation: "recordExpense", payload },
      {
        clientCommandId: "same-command",
        salt: "one-time-random-salt",
        now: new Date("2026-10-01T10:00:00.000Z"),
      },
    )
    writePendingFinanceCommand(storage as unknown as Storage, pending)

    const afterReload = readPendingFinanceCommand(
      storage as unknown as Storage,
      scope,
    )
    if (!afterReload) throw new Error("expected saved command after reload")
    expect(afterReload?.clientCommandId).toBe("same-command")
    expect(
      await matchesPendingFinanceCommand(afterReload, {
        operation: "recordExpense",
        payload: { ...payload, incurredAt: payload.incurredAt.toISOString() },
      }),
    ).toBe(true)
    expect(
      await matchesPendingFinanceCommand(afterReload, {
        operation: "recordExpense",
        payload: { ...payload, amountMinor: 12501 },
      }),
    ).toBe(false)
    expect(
      await matchesPendingFinanceCommand(afterReload, {
        operation: "payBill",
        payload,
      }),
    ).toBe(false)
    const raw = storage.getItem(financeCommandStorageKey(scope)) ?? ""
    expect(raw).not.toContain("private expense description")
  })

  test("a committed attempt is removed only after matching acknowledgement", async () => {
    const storage = new MemoryStorage()
    const pending = await createPendingFinanceCommand(
      scope,
      { operation: "recordMoney", payload: { amountMinor: 5000 } },
      { clientCommandId: "committed-command", salt: "salt" },
    )
    writePendingFinanceCommand(storage as unknown as Storage, pending)
    const changedPayload = await createPendingFinanceCommand(
      scope,
      { operation: "recordMoney", payload: { amountMinor: 5001 } },
      { clientCommandId: "other-command", salt: "other-salt" },
    )
    expect(() =>
      clearPendingFinanceCommand(
        storage as unknown as Storage,
        scope,
        changedPayload,
      ),
    ).toThrow(FinanceCommandRecoveryError)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope)
        ?.clientCommandId,
    ).toBe("committed-command")
    clearPendingFinanceCommand(storage as unknown as Storage, scope, pending)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope),
    ).toBe(null)
  })

  test("committed acknowledgement requires confirmed status and preserves marker when cleanup fails", async () => {
    const storage = new MemoryStorage()
    const pending = await createPendingFinanceCommand(
      scope,
      {
        operation: "cashAdjustmentReversal",
        payload: { entryId: "entry-1", expectedSnapshotSequence: "12" },
        recoveryMetadata: {
          entryId: "entry-1",
          expectedSnapshotSequence: "12",
        },
      },
      { clientCommandId: "committed-reversal", salt: "salt" },
    )
    writePendingFinanceCommand(storage as unknown as Storage, pending)
    expect(() =>
      acknowledgeCommittedFinanceCommand(
        storage as unknown as Storage,
        scope,
        pending,
        "NOT_FOUND",
      ),
    ).toThrow(FinanceCommandRecoveryError)
    storage.failRemove = true
    expect(() =>
      acknowledgeCommittedFinanceCommand(
        storage as unknown as Storage,
        scope,
        pending,
        "COMMITTED",
      ),
    ).toThrow(FinanceCommandRecoveryError)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope)
        ?.clientCommandId,
    ).toBe("committed-reversal")
    storage.failRemove = false
    acknowledgeCommittedFinanceCommand(
      storage as unknown as Storage,
      scope,
      pending,
      "COMMITTED",
    )
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope),
    ).toBe(null)
  })

  test("retry metadata is bounded and validates generated identity fields", async () => {
    const storage = new MemoryStorage()
    const key = financeCommandStorageKey(scope)
    const pending = await createPendingFinanceCommand(
      scope,
      {
        operation: "recordCashCount",
        payload: { amountMinor: 100 },
        recoveryMetadata: {
          accountId: "account-1",
          asOf: "2026-10-01T10:00:00.000Z",
        },
      },
      { clientCommandId: "count-command", salt: "salt" },
    )
    writePendingFinanceCommand(storage as unknown as Storage, pending)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope)
        ?.recoveryMetadata,
    ).toEqual({ accountId: "account-1", asOf: "2026-10-01T10:00:00.000Z" })
    const malformed = { ...pending, recoveryMetadata: { amount: "100" } }
    storage.corrupt(key, JSON.stringify(malformed))
    expect(() =>
      readPendingFinanceCommand(storage as unknown as Storage, scope),
    ).toThrow(FinanceCommandRecoveryError)
  })

  test("actor, Tenant and book each isolate pending command storage", async () => {
    const storage = new MemoryStorage()
    const pending = await createPendingFinanceCommand(
      scope,
      { operation: "recordExpense", payload: { amountMinor: 10 } },
      { clientCommandId: "tenant-a-command", salt: "salt" },
    )
    writePendingFinanceCommand(storage as unknown as Storage, pending)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, {
        ...scope,
        actorUserId: "user-b",
      }),
    ).toBe(null)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, {
        ...scope,
        tenantId: "tenant-b",
      }),
    ).toBe(null)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, {
        ...scope,
        bookId: "book-b",
      }),
    ).toBe(null)
  })

  test("corrupt or unavailable storage fails closed", async () => {
    const storage = new MemoryStorage()
    const key = financeCommandStorageKey(scope)
    storage.corrupt(key, "not-json")
    expect(() =>
      readPendingFinanceCommand(storage as unknown as Storage, scope),
    ).toThrow(FinanceCommandRecoveryError)

    storage.failRead = true
    expect(() =>
      readPendingFinanceCommand(storage as unknown as Storage, scope),
    ).toThrow(FinanceCommandRecoveryError)
    storage.failRead = false
    storage.failWrite = true
    const pending = await createPendingFinanceCommand(
      scope,
      { operation: "recordExpense", payload: { amountMinor: 10 } },
      { clientCommandId: "blocked-command", salt: "salt" },
    )
    expect(() =>
      writePendingFinanceCommand(storage as unknown as Storage, pending),
    ).toThrow(FinanceCommandRecoveryError)
  })

  test("submission locking fails closed when the browser lacks Web Locks", async () => {
    await expect(
      withFinanceCommandLock(scope, async () => "sent", undefined),
    ).rejects.toBeInstanceOf(FinanceCommandRecoveryError)
  })

  test("inspection locking fails closed when the browser lacks Web Locks", async () => {
    await expect(
      withFinanceCommandInspectionLock(
        scope,
        async () => "inspected",
        undefined,
      ),
    ).rejects.toBeInstanceOf(FinanceCommandRecoveryError)
  })

  test("recovery inspections queue behind active book locks", async () => {
    let held = false
    let releaseFirst: () => void = () => {
      throw new Error("The first inspection did not acquire its lock")
    }
    let secondFinished = false
    const optionsSeen: LockOptions[] = []
    const waiters: Array<() => void> = []
    const lockManager = {
      request: async (
        _name: string,
        options: LockOptions,
        callback: (lock: Lock | null) => Promise<unknown>,
      ) => {
        optionsSeen.push(options)
        if (held) await new Promise<void>((resolve) => waiters.push(resolve))
        held = true
        try {
          return await callback({} as Lock)
        } finally {
          held = false
          waiters.shift()?.()
        }
      },
    } as unknown as LockManager
    const first = withFinanceCommandInspectionLock(
      scope,
      async () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve
        }),
      lockManager,
    )
    await Promise.resolve()
    const second = withFinanceCommandInspectionLock(
      scope,
      async () => {
        secondFinished = true
      },
      lockManager,
    )
    await Promise.resolve()

    expect(secondFinished).toBe(false)
    expect(optionsSeen).toHaveLength(2)
    expect(optionsSeen).toEqual([{ mode: "exclusive" }, { mode: "exclusive" }])

    releaseFirst()
    await Promise.all([first, second])
    expect(secondFinished).toBe(true)
  })

  test("overlapping tabs do not queue a second identity after the first clears", async () => {
    let held = false
    let releaseFirst: () => void = () => {
      throw new Error("The first submission did not acquire its lock")
    }
    let secondCallbackRan = false
    const lockManager = {
      request: async (
        _name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<unknown>,
      ) => {
        if (held) return callback(null)
        held = true
        try {
          return await callback({} as Lock)
        } finally {
          held = false
        }
      },
    } as unknown as LockManager
    const storage = new MemoryStorage()
    const pending = await createPendingFinanceCommand(
      scope,
      { operation: "recordExpense", payload: { amountMinor: 1000 } },
      { clientCommandId: "first-command", salt: "first-salt" },
    )
    const first = withFinanceCommandLock(
      scope,
      async () => {
        writePendingFinanceCommand(storage as unknown as Storage, pending)
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
        clearPendingFinanceCommand(
          storage as unknown as Storage,
          scope,
          pending,
        )
      },
      lockManager,
    )
    await Promise.resolve()
    await expect(
      withFinanceCommandLock(
        scope,
        async () => {
          secondCallbackRan = true
        },
        lockManager,
      ),
    ).rejects.toBeInstanceOf(FinanceCommandLockUnavailableError)
    releaseFirst()
    await first
    expect(secondCallbackRan).toBe(false)
    expect(
      readPendingFinanceCommand(storage as unknown as Storage, scope),
    ).toBe(null)
  })
})
