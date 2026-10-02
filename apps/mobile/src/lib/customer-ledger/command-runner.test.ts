import { expect, test } from "bun:test"
import { createFinanceCommandRunner } from "./command-runner"
const scope = {
  actorUserId: "owner",
  tenantId: "tenant",
  bookId: "customer-ledger/book/account",
}
function fixture() {
  const store = new Map<string, string>()
  let serial = 0
  let current = true
  let status: "COMMITTED" | "NOT_FOUND" = "NOT_FOUND"
  let writes = 0
  const runtime = {
    storage: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: async (k: string) => {
        store.delete(k)
      },
    },
    uuid: () => `id-${++serial}`,
    hash: async (v: string) =>
      new Bun.CryptoHasher("sha256").update(v).digest("hex"),
    isCurrent: () => current,
    status: async () => status,
    withLock: async <T>(cb: () => Promise<T>) => cb(),
  }
  return {
    store,
    runtime,
    setStatus: (s: typeof status) => {
      status = s
    },
    setCurrent: (c: boolean) => {
      current = c
    },
    write: async () => {
      writes++
    },
    writes: () => writes,
  }
}
test("uncertain receipt saves identity and safe metadata only; exact retry reuses it", async () => {
  const f = fixture()
  const first = createFinanceCommandRunner(scope, f.runtime)
  const ids: string[] = []
  const payload = {
    amountMinor: "600001",
    description: "Private customer reason",
    effectiveAt: new Date("2026-10-02T10:00:00.000Z"),
    expectedRevision: "3",
  }
  await expect(
    first.run(
      "recordReceipt",
      payload,
      async (id) => {
        ids.push(id)
        throw new Error("Lost response")
      },
      {
        asOf: payload.effectiveAt.toISOString(),
        expectedSnapshotSequence: "3",
      },
    ),
  ).rejects.toThrow("Lost response")
  const raw = [...f.store.values()][0] ?? ""
  expect(raw).not.toContain("600001")
  expect(raw).not.toContain("Private customer reason")
  expect(raw).toContain("expectedSnapshotSequence")
  const restarted = createFinanceCommandRunner(scope, f.runtime)
  await expect(
    restarted.run("recordReceipt", { ...payload, amountMinor: "1" }, f.write),
  ).rejects.toThrow("exact original")
  await restarted.run("recordReceipt", payload, async (id) => {
    ids.push(id)
  })
  expect(ids[0]).toBe(ids[1])
  expect(f.store.size).toBe(0)
})
test("NOT_FOUND cannot clear an uncertain attempt; committed acknowledgement never writes", async () => {
  const f = fixture()
  const runner = createFinanceCommandRunner(scope, f.runtime)
  await expect(
    runner.run("applyCredit", { amountMinor: "1" }, async () => {
      throw new Error("timeout")
    }),
  ).rejects.toThrow()
  await expect(runner.acknowledge()).rejects.toThrow("No recorded result")
  expect(f.store.size).toBe(1)
  f.setStatus("COMMITTED")
  expect(await runner.acknowledge()).toBe("RECORDED")
  expect(f.writes()).toBe(0)
  expect(f.store.size).toBe(0)
})
test("account namespaces cannot recover another account's command", async () => {
  const f = fixture()
  const runner = createFinanceCommandRunner(scope, f.runtime)
  await expect(
    runner.run("recordReceipt", { amountMinor: "1" }, async () => {
      throw new Error("timeout")
    }),
  ).rejects.toThrow()
  expect(
    await createFinanceCommandRunner(
      { ...scope, bookId: "customer-ledger/book/other-account" },
      f.runtime,
    ).inspect(),
  ).toBeNull()
  f.setCurrent(false)
  await expect(
    runner.run("recordReceipt", { amountMinor: "1" }, f.write),
  ).rejects.toThrow("original account")
  expect(f.writes()).toBe(0)
})
test("first definitive rejection needs acknowledgement and never permits a changed retry", async () => {
  const f = fixture()
  const runner = createFinanceCommandRunner(scope, f.runtime)
  const failure = Object.assign(new Error("stale revision"), {
    data: { code: "CONFLICT" },
  })
  await expect(
    runner.run("applyCredit", { expectedRevision: "1" }, async () => {
      throw failure
    }),
  ).rejects.toThrow("stale revision")
  expect((await runner.inspect())?.rejectedCode).toBe("CONFLICT")
  await expect(
    runner.run("applyCredit", { expectedRevision: "2" }, f.write),
  ).rejects.toThrow("exact original")
  expect(await runner.acknowledge()).toBe("REJECTED")
  expect(f.store.size).toBe(0)
})
test("storage failure prevents the network write", async () => {
  const f = fixture()
  const runner = createFinanceCommandRunner(scope, {
    ...f.runtime,
    storage: {
      ...f.runtime.storage,
      setItem: async () => {
        throw new Error("quota")
      },
    },
  })
  await expect(
    runner.run("recordReceipt", { amountMinor: "1" }, f.write),
  ).rejects.toThrow("quota")
  expect(f.writes()).toBe(0)
})

test("a delayed storage read cannot restore an already acknowledged command", async () => {
  const f = fixture()
  let hold = false
  let finish: ((value: string | null) => void) | undefined
  const runner = createFinanceCommandRunner(scope, {
    ...f.runtime,
    storage: {
      ...f.runtime.storage,
      getItem: async (key) => {
        const value = f.store.get(key) ?? null
        if (hold)
          return new Promise<string | null>((resolve) => {
            finish = resolve
          })
        return value
      },
    },
  })
  await expect(
    runner.run("recordReceipt", { amountMinor: "1" }, async () => {
      throw new Error("lost")
    }),
  ).rejects.toThrow("lost")
  const earlier = [...f.store.values()][0] ?? null
  hold = true
  const late = runner.inspect()
  hold = false
  f.setStatus("COMMITTED")
  expect(await runner.acknowledge()).toBe("RECORDED")
  if (!finish) throw new Error("Deferred read missing")
  finish(earlier)
  expect(await late).toBeNull()
  expect(await runner.inspect()).toBeNull()
  expect(f.writes()).toBe(0)
})
test("account or session changes during storage read prevent submission", async () => {
  const f = fixture()
  const runner = createFinanceCommandRunner(scope, {
    ...f.runtime,
    storage: {
      ...f.runtime.storage,
      getItem: async () => {
        f.setCurrent(false)
        return null
      },
    },
  })
  await expect(
    runner.run("recordReceipt", { amountMinor: "1" }, f.write),
  ).rejects.toThrow("original account")
  expect(f.writes()).toBe(0)
  expect(f.store.size).toBe(0)
})
