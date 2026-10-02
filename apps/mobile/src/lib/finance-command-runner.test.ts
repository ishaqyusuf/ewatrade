import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { FinanceCashCommandSource } from "@ewatrade/utils/finance-command-identity"
import { createFinanceCommandRunner } from "./finance-command-runner"

const scope = { actorUserId: "owner", tenantId: "business", bookId: "book" }
function fixture() {
  const records = new Map<string, string>()
  let id = 0
  let locked = false
  const state = {
    current: true,
    status: "NOT_FOUND" as "NOT_FOUND" | "COMMITTED",
    failSave: false,
    failRemove: false,
    cashSource: null as FinanceCashCommandSource | null,
  }
  const runtime = {
    storage: {
      getItem: async (key: string) => records.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (state.failSave) throw new Error("Storage unavailable")
        records.set(key, value)
      },
      removeItem: async (key: string) => {
        if (state.failRemove) throw new Error("Storage cleanup unavailable")
        records.delete(key)
      },
    },
    uuid: () => `id-${++id}`,
    hash: async (value: string) =>
      createHash("sha256").update(value).digest("hex"),
    status: async () => state.status,
    cashSource: async (
      _bookId: string,
      countId: string,
    ): Promise<FinanceCashCommandSource> =>
      state.cashSource ?? { id: countId, adjustment: null },
    isCurrent: () => state.current,
    withLock: async <T>(action: () => Promise<T>) => {
      if (locked) throw new Error("Another submission is running")
      locked = true
      try {
        return await action()
      } finally {
        locked = false
      }
    },
  }
  return {
    records,
    state,
    runtime,
    runner: createFinanceCommandRunner(scope, runtime),
  }
}
const payload = {
  payeeName: "Private payee",
  amountMinor: "2500",
  date: new Date("2026-10-02T00:00:00Z"),
}
const purchaseRetries = [
  {
    operation: "registerPurchase",
    payload: {
      bookId: "book",
      supplierId: "supplier",
      storeId: "store",
      agreedAt: new Date("2026-10-02T00:00:00Z"),
      description: "Original goods",
      lines: [
        {
          balanceSourceId: "source",
          expectedConfigurationVersionId: "config",
          enteredInventoryUnitId: "unit",
          enteredQuantity: "2.5",
          categories: [{ name: "Goods" }],
          description: "Original line",
          amountMinor: "2500",
        },
      ],
    },
  },
  {
    operation: "recognizePurchase",
    payload: {
      bookId: "book",
      recognitionId: "purchase",
      stage: "RECEIPT",
      reference: "Original receipt",
      effectiveAt: new Date("2026-10-02T00:00:00Z"),
      receipts: [{ lineId: "line", expectedBalanceRevision: 8 }],
    },
  },
  {
    operation: "reversePurchaseRecognition",
    payload: {
      bookId: "book",
      eventId: "original-event",
      reason: "Original correction reason",
      effectiveAt: new Date("2026-10-02T00:00:00Z"),
    },
  },
] as const
describe("mobile finance command recovery", () => {
  test("late inspection cannot restore a command acknowledged while its storage read waited", async () => {
    const f = fixture()
    await expect(
      f.runner.run("registerPurchase", payload, async () => {
        throw new Error("Disconnected")
      }),
    ).rejects.toThrow("Disconnected")
    const getItem = f.runtime.storage.getItem
    let hold = true
    let finish: ((value: string | null) => void) | undefined
    f.runtime.storage.getItem = async (key) => {
      const saved = await getItem(key)
      if (!hold) return saved
      return new Promise<string | null>((resolve) => {
        finish = resolve
      })
    }
    const saved = [...f.records.values()][0] ?? null
    const late = f.runner.inspect()
    // Let the deferred storage read enter before resolving a separate acknowledgement.
    await Promise.resolve()
    hold = false
    f.state.status = "COMMITTED"
    expect(await f.runner.acknowledge()).toBe("RECORDED")
    if (!finish) throw new Error("Expected deferred inspection")
    finish(saved)
    expect(await late).toBeNull()
    expect(await f.runner.inspect()).toBeNull()
    expect(f.records.size).toBe(0)
  })

  for (const retry of purchaseRetries) {
    test(`${retry.operation} exact restart retry keeps its identity and refuses changed details`, async () => {
      const f = fixture()
      let originalId = ""
      await expect(
        f.runner.run(retry.operation, retry.payload, async (id) => {
          originalId = id
          throw new Error("Disconnected")
        }),
      ).rejects.toThrow("Disconnected")
      const saved = [...f.records.values()][0]
      if (!saved) throw new Error("Expected retained purchase identity")
      expect(saved).not.toContain("Original")
      expect(saved).not.toContain("2500")
      const restarted = createFinanceCommandRunner(scope, f.runtime)
      let writes = 0
      const mismatch = async (operation: string, changed: unknown) => {
        await expect(
          restarted.run(operation, changed, async () => {
            writes++
          }),
        ).rejects.toThrow("unresolved submission")
        expect([...f.records.values()][0]).toBe(saved)
      }
      await mismatch("recordExpense", retry.payload)
      await mismatch(retry.operation, { ...retry.payload, bookId: "other" })
      await mismatch(retry.operation, {
        ...retry.payload,
        ...(retry.operation === "registerPurchase"
          ? { agreedAt: new Date("2026-10-01T00:00:00Z") }
          : { effectiveAt: new Date("2026-10-01T00:00:00Z") }),
      })
      if (retry.operation === "registerPurchase") {
        await mismatch(retry.operation, {
          ...retry.payload,
          supplierId: "other-supplier",
        })
        await mismatch(retry.operation, {
          ...retry.payload,
          lines: [{ ...retry.payload.lines[0], amountMinor: "2600" }],
        })
        await mismatch(retry.operation, {
          ...retry.payload,
          lines: [
            {
              ...retry.payload.lines[0],
              expectedConfigurationVersionId: "new-config",
            },
          ],
        })
      } else if (retry.operation === "recognizePurchase") {
        await mismatch(retry.operation, {
          ...retry.payload,
          recognitionId: "other-purchase",
        })
        await mismatch(retry.operation, { ...retry.payload, stage: "INVOICE" })
        await mismatch(retry.operation, {
          ...retry.payload,
          receipts: [{ lineId: "line", expectedBalanceRevision: 9 }],
        })
      } else {
        await mismatch(retry.operation, {
          ...retry.payload,
          eventId: "other-event",
        })
        await mismatch(retry.operation, {
          ...retry.payload,
          reason: "Changed correction reason",
        })
      }
      expect(writes).toBe(0)
      let retryId = ""
      await restarted.run(retry.operation, retry.payload, async (id) => {
        retryId = id
        writes++
      })
      expect(retryId).toBe(originalId)
      expect(writes).toBe(1)
      expect(f.records.size).toBe(0)
    })
  }

  test("a storage read settling after authority loss reveals no retained command", async () => {
    const f = fixture()
    await expect(
      f.runner.run("registerPurchase", payload, async () => {
        throw new Error("Disconnected")
      }),
    ).rejects.toThrow("Disconnected")
    const getItem = f.runtime.storage.getItem
    f.runtime.storage.getItem = async (key) => {
      const saved = await getItem(key)
      f.state.current = false
      return saved
    }
    const restarted = createFinanceCommandRunner(scope, f.runtime)
    await expect(restarted.inspect()).rejects.toThrow("original account")
    expect(f.records.size).toBe(1)
  })

  test("authority loss during retry hashing stops before command-status or writes", async () => {
    const f = fixture()
    await expect(
      f.runner.run("registerPurchase", payload, async () => {
        throw new Error("Disconnected")
      }),
    ).rejects.toThrow("Disconnected")
    let statusReads = 0
    let writes = 0
    const hash = f.runtime.hash
    f.runtime.hash = async (value) => {
      const digest = await hash(value)
      f.state.current = false
      return digest
    }
    f.runtime.status = async () => {
      statusReads++
      return f.state.status
    }
    await expect(
      createFinanceCommandRunner(scope, f.runtime).run(
        "registerPurchase",
        payload,
        async () => {
          writes++
        },
      ),
    ).rejects.toThrow("original account")
    expect(statusReads).toBe(0)
    expect(writes).toBe(0)
    expect(f.records.size).toBe(1)
  })

  test("authority loss during retry status retains identity and prevents a send", async () => {
    const f = fixture()
    await expect(
      f.runner.run("recognizePurchase", payload, async () => {
        throw new Error("Disconnected")
      }),
    ).rejects.toThrow("Disconnected")
    let writes = 0
    f.runtime.status = async () => {
      f.state.current = false
      return "NOT_FOUND"
    }
    await expect(
      createFinanceCommandRunner(scope, f.runtime).run(
        "recognizePurchase",
        payload,
        async () => {
          writes++
        },
      ),
    ).rejects.toThrow("original account")
    expect(writes).toBe(0)
    expect(f.records.size).toBe(1)
  })

  test("lost response survives restart and acknowledgement does not write twice", async () => {
    const f = fixture()
    let writes = 0
    await expect(
      f.runner.run("recordExpense", payload, async () => {
        writes++
        f.state.status = "COMMITTED"
        throw new Error("Lost response")
      }),
    ).rejects.toThrow("Lost response")
    const saved = [...f.records.values()][0]
    if (!saved) throw new Error("Expected retained command")
    expect(saved).not.toContain("Private payee")
    expect(saved).not.toContain("2500")
    const restarted = createFinanceCommandRunner(scope, f.runtime)
    expect((await restarted.inspect())?.command.operation).toBe("recordExpense")
    expect(await restarted.acknowledge()).toBe("RECORDED")
    expect(writes).toBe(1)
    expect(f.records.size).toBe(0)
  })
  test("NOT_FOUND retains the original identity and rejects changed details", async () => {
    const f = fixture()
    let originalId = ""
    await expect(
      f.runner.run("recordExpense", payload, async (id) => {
        originalId = id
        throw new Error("Disconnected")
      }),
    ).rejects.toThrow()
    const restarted = createFinanceCommandRunner(scope, f.runtime)
    await expect(restarted.acknowledge()).rejects.toThrow(
      "exact original details",
    )
    await expect(
      restarted.run(
        "recordExpense",
        { ...payload, amountMinor: "2600" },
        async () => {
          throw new Error("Must not send")
        },
      ),
    ).rejects.toThrow("unresolved submission")
    let retryId = ""
    await restarted.run("recordExpense", payload, async (id) => {
      retryId = id
    })
    expect(retryId).toBe(originalId)
    expect(f.records.size).toBe(0)
  })
  test("a definitive fresh rejection can be acknowledged without claiming a posting", async () => {
    const f = fixture()
    const rejection = Object.assign(new Error("Invalid category"), {
      data: { code: "BAD_REQUEST" },
    })
    await expect(
      f.runner.run("recordExpense", payload, async () => {
        throw rejection
      }),
    ).rejects.toThrow("Invalid category")
    const restarted = createFinanceCommandRunner(scope, f.runtime)
    expect(await restarted.acknowledge()).toBe("REJECTED")
    expect(f.records.size).toBe(0)
  })
  test("a rejection after an uncertain attempt cannot clear its identity", async () => {
    const f = fixture()
    await expect(
      f.runner.run("recordExpense", payload, async () => {
        throw new Error("Disconnected")
      }),
    ).rejects.toThrow()
    await expect(
      f.runner.run("recordExpense", payload, async () => {
        throw Object.assign(new Error("Rejected retry"), {
          data: { code: "CONFLICT" },
        })
      }),
    ).rejects.toThrow()
    await expect(f.runner.acknowledge()).rejects.toThrow(
      "exact original details",
    )
    expect(f.records.size).toBe(1)
  })
  test("unavailable storage prevents submission", async () => {
    const f = fixture()
    f.state.failSave = true
    let writes = 0
    await expect(
      f.runner.run("recordExpense", payload, async () => {
        writes++
      }),
    ).rejects.toThrow("Storage unavailable")
    expect(writes).toBe(0)
  })
  test("scope change after a committed write retains recovery until the original scope returns", async () => {
    const f = fixture()
    await expect(
      f.runner.run("recordExpense", payload, async () => {
        f.state.status = "COMMITTED"
        f.state.current = false
      }),
    ).rejects.toThrow("original account")
    expect(f.records.size).toBe(1)
    f.state.current = true
    expect(await f.runner.acknowledge()).toBe("RECORDED")
  })
  test("corrupt metadata fails closed", async () => {
    const f = fixture()
    await expect(
      f.runner.run("recordExpense", payload, async () => {
        throw new Error("Lost")
      }),
    ).rejects.toThrow()
    const key = [...f.records.keys()][0]
    if (!key) throw new Error("Expected retained command key")
    f.records.set(key, "invalid json")
    await expect(
      createFinanceCommandRunner(scope, f.runtime).inspect(),
    ).rejects.toThrow("unreadable")
  })
  test("failed cleanup after success keeps the identity and prevents a second write", async () => {
    const f = fixture()
    f.state.failRemove = true
    let writes = 0
    await expect(
      f.runner.run("recordExpense", payload, async () => {
        writes++
        f.state.status = "COMMITTED"
      }),
    ).rejects.toThrow("Storage cleanup unavailable")
    const restarted = createFinanceCommandRunner(scope, f.runtime)
    await expect(
      restarted.run("recordExpense", payload, async () => {
        writes++
      }),
    ).rejects.toThrow("acknowledge the earlier result")
    f.state.failRemove = false
    expect(await restarted.acknowledge()).toBe("RECORDED")
    expect(writes).toBe(1)
    expect(f.records.size).toBe(0)
  })
  test("another authenticated actor cannot acknowledge the original actor's command", async () => {
    const f = fixture()
    await expect(
      f.runner.run("recordExpense", payload, async () => {
        throw new Error("Lost response")
      }),
    ).rejects.toThrow()
    const otherActor = createFinanceCommandRunner(
      { ...scope, actorUserId: "another-owner" },
      f.runtime,
    )
    expect(await otherActor.inspect()).toBeNull()
    expect(await otherActor.acknowledge()).toBe("NONE")
    expect(f.records.size).toBe(1)
    expect((await f.runner.inspect())?.command.actorUserId).toBe("owner")
  })
  test("generated count time survives restart without persisting money or reference", async () => {
    const f = fixture()
    const asOf = "2026-10-02T10:30:00.000Z"
    const count = {
      accountId: "cash",
      asOf: new Date(asOf),
      observedBalanceMinor: "98000",
      reference: "Private count note",
    }
    let first = ""
    await expect(
      f.runner.run(
        "recordCashCount",
        count,
        async (id) => {
          first = id
          throw new Error("Lost")
        },
        { recoveryMetadata: { accountId: "cash", asOf } },
      ),
    ).rejects.toThrow()
    const saved = [...f.records.values()][0] ?? ""
    expect(saved).not.toContain("Private count note")
    expect(saved).not.toContain("98000")
    const restarted = createFinanceCommandRunner(scope, f.runtime)
    expect((await restarted.inspect())?.command.recoveryMetadata).toEqual({
      accountId: "cash",
      asOf,
    })
    let retry = ""
    await restarted.run("recordCashCount", count, async (id) => {
      retry = id
    })
    expect(retry).toBe(first)
  })
  test("private retry metadata cannot be saved or sent", async () => {
    const f = fixture()
    let writes = 0
    await expect(
      f.runner.run(
        "recordCashCount",
        payload,
        async () => {
          writes++
        },
        { recoveryMetadata: JSON.parse('{"reason":"Private reason"}') },
      ),
    ).rejects.toThrow("unsupported retry metadata")
    expect(writes).toBe(0)
    expect(f.records.size).toBe(0)
  })
  test("readback must retain the reviewed generated facts exactly", async () => {
    const f = fixture()
    const set = f.runtime.storage.setItem
    f.runtime.storage.setItem = async (key, value) => {
      const altered = JSON.parse(value)
      altered.command.recoveryMetadata.expectedSnapshotSequence = "9"
      await set(key, JSON.stringify(altered))
    }
    let writes = 0
    await expect(
      f.runner.run(
        "adjustCashCount",
        payload,
        async () => {
          writes++
        },
        {
          recoveryMetadata: { countId: "count", expectedSnapshotSequence: "8" },
        },
      ),
    ).rejects.toThrow("could not be saved")
    expect(writes).toBe(0)
  })
  test("only the freshly matched reviewed source releases a superseded adjustment", async () => {
    const f = fixture()
    await expect(
      f.runner.run(
        "adjustCashCount",
        payload,
        async () => {
          throw new Error("Lost")
        },
        {
          recoveryMetadata: { countId: "count", expectedSnapshotSequence: "8" },
        },
      ),
    ).rejects.toThrow()
    f.state.cashSource = {
      id: "count",
      adjustment: { id: "adjustment", reversal: null },
    }
    await expect(f.runner.acknowledge()).rejects.toThrow(
      "exact original details",
    )
    await expect(f.runner.acknowledgeSuperseded("unrelated")).rejects.toThrow(
      "changed",
    )
    expect(f.records.size).toBe(1)
    f.state.cashSource = {
      id: "foreign-count",
      adjustment: { id: "adjustment", reversal: null },
    }
    await expect(f.runner.acknowledgeSuperseded("adjustment")).rejects.toThrow(
      "changed",
    )
    f.state.cashSource = {
      id: "count",
      adjustment: { id: "adjustment", reversal: null },
    }
    expect(await f.runner.acknowledgeSuperseded("adjustment")).toBe(
      "SUPERSEDED",
    )
    expect(f.records.size).toBe(0)
  })
  test("superseded reversal binds the original adjustment and linked reversal", async () => {
    const f = fixture()
    await expect(
      f.runner.run(
        "cashAdjustmentReversal",
        payload,
        async () => {
          throw new Error("Lost")
        },
        {
          recoveryMetadata: {
            countId: "count",
            entryId: "adjustment",
            expectedSnapshotSequence: "8",
          },
        },
      ),
    ).rejects.toThrow()
    f.state.cashSource = {
      id: "count",
      adjustment: { id: "different", reversal: { id: "reversal" } },
    }
    await expect(f.runner.acknowledgeSuperseded("reversal")).rejects.toThrow(
      "changed",
    )
    f.state.cashSource = {
      id: "count",
      adjustment: { id: "adjustment", reversal: null },
    }
    await expect(f.runner.acknowledgeSuperseded("reversal")).rejects.toThrow(
      "changed",
    )
    f.state.cashSource.adjustment = {
      id: "adjustment",
      reversal: { id: "reversal" },
    }
    expect(await f.runner.acknowledgeSuperseded("reversal")).toBe("SUPERSEDED")
  })
  test("unavailable or no-longer-authorized source reads retain recovery", async () => {
    const f = fixture()
    await expect(
      f.runner.run(
        "adjustCashCount",
        payload,
        async () => {
          throw new Error("Lost")
        },
        { recoveryMetadata: { countId: "count" } },
      ),
    ).rejects.toThrow()
    f.runtime.cashSource = async () => {
      throw new Error("Unavailable")
    }
    await expect(f.runner.acknowledgeSuperseded("adjustment")).rejects.toThrow(
      "Unavailable",
    )
    f.runtime.cashSource = async () => {
      f.state.current = false
      return { id: "count", adjustment: { id: "adjustment", reversal: null } }
    }
    await expect(f.runner.acknowledgeSuperseded("adjustment")).rejects.toThrow(
      "original account",
    )
    expect(f.records.size).toBe(1)
  })
  test("a retained missing marker cannot resurrect an already completed cash action", async () => {
    const f = fixture()
    await expect(
      f.runner.run(
        "adjustCashCount",
        payload,
        async () => {
          throw new Error("Lost")
        },
        { recoveryMetadata: { countId: "count" } },
      ),
    ).rejects.toThrow()
    f.state.cashSource = {
      id: "count",
      adjustment: { id: "adjustment", reversal: null },
    }
    const sibling = createFinanceCommandRunner(scope, f.runtime)
    expect(await sibling.acknowledgeSuperseded("adjustment")).toBe("SUPERSEDED")
    let writes = 0
    await expect(
      f.runner.run("adjustCashCount", payload, async () => {
        writes++
      }),
    ).rejects.toThrow("already completed")
    expect(writes).toBe(0)
    expect(f.records.size).toBe(0)
    expect(await f.runner.acknowledgeSuperseded("adjustment")).toBe(
      "SUPERSEDED",
    )
  })
})
