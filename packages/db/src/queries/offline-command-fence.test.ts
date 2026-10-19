import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import {
  type OfflineCommandFence,
  acquireOfflineCommandFences,
  assertOfflineCommandFence,
} from "./offline-command-fence"

function deferred() {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function fixture(wait?: (index: number) => Promise<void>) {
  const calls: Array<{ sql: string; value: bigint }> = []
  const tx = {
    $executeRaw: async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      if (values.length !== 1 || typeof values[0] !== "bigint")
        throw Error("Unexpected advisory-lock port")
      calls.push({ sql: strings.join("?"), value: values[0] })
      await wait?.(calls.length - 1)
      return 1
    },
  } as unknown as Prisma.TransactionClient
  return { tx, calls }
}

const scope = { tenantId: "tenant", clientCommandIds: ["b", "c", "a"] }
const identity = { tenantId: "tenant", clientCommandId: "a" }

test("actual namespaced locks use signed int64 numeric order without precision loss", async () => {
  const f = fixture()
  const fence = await acquireOfflineCommandFences(f.tx, scope)
  // Fixed public coordination vectors, including values outside JS safe integers.
  expect(f.calls).toEqual([
    {
      sql: "SELECT pg_advisory_xact_lock(?::bigint)",
      value: -8833379238652566717n,
    },
    {
      sql: "SELECT pg_advisory_xact_lock(?::bigint)",
      value: 183457106487235185n,
    },
    {
      sql: "SELECT pg_advisory_xact_lock(?::bigint)",
      value: 9141583329698907717n,
    },
  ])
  expect(Object.isFrozen(fence)).toBe(true)
  for (const clientCommandId of scope.clientCommandIds)
    expect(() =>
      assertOfflineCommandFence(f.tx, fence, { ...identity, clientCommandId }),
    ).not.toThrow()
})

test("reversed and duplicate identity sets acquire identical lock sequences", async () => {
  const a = fixture()
  const b = fixture()
  await acquireOfflineCommandFences(a.tx, scope)
  await acquireOfflineCommandFences(b.tx, {
    tenantId: "tenant",
    clientCommandIds: ["a", "c", "b", "a", "b"],
  })
  expect(a.calls).toEqual(b.calls)
  expect(b.calls).toHaveLength(3)
})

test("same client identity in different Tenants acquires different namespaced locks", async () => {
  const a = fixture()
  const b = fixture()
  await acquireOfflineCommandFences(a.tx, {
    tenantId: "tenant",
    clientCommandIds: ["same"],
  })
  await acquireOfflineCommandFences(b.tx, {
    tenantId: "other",
    clientCommandIds: ["same"],
  })
  expect(a.calls[0]?.value).toBe(-4202905794402631663n)
  expect(b.calls[0]?.value).toBe(-6611175159140434464n)
})

test("exact identities are preserved without trimming or normalization", async () => {
  const f = fixture()
  const fence = await acquireOfflineCommandFences(f.tx, {
    tenantId: "tenant",
    clientCommandIds: [" padded "],
  })
  expect(f.calls[0]?.value).toBe(-3819061635790951194n)
  expect(() =>
    assertOfflineCommandFence(f.tx, fence, {
      tenantId: "tenant",
      clientCommandId: " padded ",
    }),
  ).not.toThrow()
  expect(() =>
    assertOfflineCommandFence(f.tx, fence, {
      tenantId: "tenant",
      clientCommandId: "padded",
    }),
  ).toThrow("coordination")
})

test("issued proof refuses a different transaction, Tenant or identity", async () => {
  const f = fixture()
  const other = fixture()
  const fence = await acquireOfflineCommandFences(f.tx, scope)
  expect(() => assertOfflineCommandFence(other.tx, fence, identity)).toThrow(
    "coordination",
  )
  expect(() =>
    assertOfflineCommandFence(f.tx, fence, { ...identity, tenantId: "other" }),
  ).toThrow("coordination")
  expect(() =>
    assertOfflineCommandFence(f.tx, fence, {
      ...identity,
      clientCommandId: "unheld",
    }),
  ).toThrow("coordination")
})

test("structural, copied and serialized proof lookalikes cannot authorize a write", async () => {
  const f = fixture()
  const fence = await acquireOfflineCommandFences(f.tx, scope)
  for (const fake of [{}, { ...fence }, JSON.parse(JSON.stringify(fence))])
    expect(() =>
      assertOfflineCommandFence(f.tx, fake as OfflineCommandFence, identity),
    ).toThrow("coordination")
  expect(() => assertOfflineCommandFence(f.tx, fence, identity)).not.toThrow()
})

test("complete set reservation rejects concurrent extension before the first await", async () => {
  const gate = deferred()
  const f = fixture(() => gate.promise)
  const acquisition = acquireOfflineCommandFences(f.tx, {
    tenantId: "tenant",
    clientCommandIds: ["a"],
  })
  expect(f.calls).toHaveLength(0)
  await expect(acquireOfflineCommandFences(f.tx, scope)).rejects.toThrow(
    "coordination",
  )
  gate.resolve()
  await acquisition
  expect(f.calls).toHaveLength(1)
})

test("concurrent different-Tenant call cannot replace the reserved scope", async () => {
  const gate = deferred()
  const f = fixture(() => gate.promise)
  const acquisition = acquireOfflineCommandFences(f.tx, scope)
  await expect(
    acquireOfflineCommandFences(f.tx, { ...scope, tenantId: "other" }),
  ).rejects.toThrow("coordination")
  gate.resolve()
  const fence = await acquisition
  expect(() => assertOfflineCommandFence(f.tx, fence, identity)).not.toThrow()
})

test("subset callers await every originally reserved lock and share one proof", async () => {
  const gates = [deferred(), deferred()]
  const started = [deferred(), deferred()]
  const f = fixture(async (index) => {
    started[index]?.resolve()
    await gates[index]?.promise
  })
  const acquisition = acquireOfflineCommandFences(f.tx, {
    tenantId: "tenant",
    clientCommandIds: ["a", "b"],
  })
  let subsetReady = false
  const subset = acquireOfflineCommandFences(f.tx, {
    tenantId: "tenant",
    clientCommandIds: ["a"],
  }).then((fence) => {
    subsetReady = true
    return fence
  })
  await started[0]?.promise
  expect(subsetReady).toBe(false)
  gates[0]?.resolve()
  await started[1]?.promise
  expect(subsetReady).toBe(false)
  expect(f.calls).toHaveLength(2)
  gates[1]?.resolve()
  const [whole, part] = await Promise.all([acquisition, subset])
  expect(part).toBe(whole)
  expect(subsetReady).toBe(true)
  expect(f.calls).toHaveLength(2)
})

test("completed reservation permits subsets but refuses late extension", async () => {
  const f = fixture()
  const fence = await acquireOfflineCommandFences(f.tx, scope)
  expect(
    await acquireOfflineCommandFences(f.tx, {
      tenantId: "tenant",
      clientCommandIds: ["a", "a"],
    }),
  ).toBe(fence)
  await expect(
    acquireOfflineCommandFences(f.tx, {
      tenantId: "tenant",
      clientCommandIds: [...scope.clientCommandIds, "new"],
    }),
  ).rejects.toThrow("coordination")
  expect(f.calls).toHaveLength(3)
})

test("failed acquisition stays rejected for subsets and cannot be retried in the transaction", async () => {
  const failure = Error("inert lock acquisition failed")
  const f = fixture(async (index) => {
    if (index === 1) throw failure
  })
  await expect(acquireOfflineCommandFences(f.tx, scope)).rejects.toBe(failure)
  expect(f.calls).toHaveLength(2)
  await expect(
    acquireOfflineCommandFences(f.tx, {
      tenantId: "tenant",
      clientCommandIds: ["a"],
    }),
  ).rejects.toBe(failure)
  await expect(acquireOfflineCommandFences(f.tx, scope)).rejects.toBe(failure)
  expect(f.calls).toHaveLength(2)
})

test("retained input array cannot extend the reserved identity set", async () => {
  const gate = deferred()
  const f = fixture(() => gate.promise)
  const input = { tenantId: "tenant", clientCommandIds: ["a"] }
  const acquisition = acquireOfflineCommandFences(f.tx, input)
  input.clientCommandIds.push("b")
  gate.resolve()
  const fence = await acquisition
  expect(() => assertOfflineCommandFence(f.tx, fence, identity)).not.toThrow()
  expect(() =>
    assertOfflineCommandFence(f.tx, fence, {
      ...identity,
      clientCommandId: "b",
    }),
  ).toThrow("coordination")
  expect(f.calls).toHaveLength(1)
})

test("retained mutable input cannot change proof Tenant while acquisition is pending", async () => {
  const gate = deferred()
  const started = deferred()
  const f = fixture(async () => {
    started.resolve()
    await gate.promise
  })
  const input = { tenantId: "tenant", clientCommandIds: ["a"] }
  const acquisition = acquireOfflineCommandFences(f.tx, input)
  await started.promise
  input.tenantId = "other"
  gate.resolve()
  const fence = await acquisition
  expect(f.calls[0]?.value).toBe(-8833379238652566717n)
  expect(() => assertOfflineCommandFence(f.tx, fence, identity)).not.toThrow()
  expect(() =>
    assertOfflineCommandFence(f.tx, fence, { ...identity, tenantId: "other" }),
  ).toThrow("coordination")
})

const invalidInputs = [
  { name: "empty Tenant", tenantId: "", clientCommandIds: ["a"] },
  { name: "empty identity set", tenantId: "tenant", clientCommandIds: [] },
  { name: "empty identity", tenantId: "tenant", clientCommandIds: [""] },
  {
    name: "identity over 160 characters",
    tenantId: "tenant",
    clientCommandIds: ["x".repeat(161)],
  },
  {
    name: "501 distinct identities",
    tenantId: "tenant",
    clientCommandIds: Array.from({ length: 501 }, (_, index) => `id-${index}`),
  },
  {
    name: "501 duplicate identities",
    tenantId: "tenant",
    clientCommandIds: Array.from({ length: 501 }, () => "a"),
  },
]

for (const { name, ...input } of invalidInputs)
  test(`invalid ${name} refuses before SQL and does not reserve the transaction`, async () => {
    const f = fixture()
    await expect(acquireOfflineCommandFences(f.tx, input)).rejects.toThrow(
      "coordination",
    )
    expect(f.calls).toHaveLength(0)
    const fence = await acquireOfflineCommandFences(f.tx, {
      tenantId: "tenant",
      clientCommandIds: ["a"],
    })
    expect(() => assertOfflineCommandFence(f.tx, fence, identity)).not.toThrow()
  })

test("500 duplicate identities are bounded before dedup and acquire one lock", async () => {
  const f = fixture()
  await acquireOfflineCommandFences(f.tx, {
    tenantId: "tenant",
    clientCommandIds: Array.from({ length: 500 }, () => "a"),
  })
  expect(f.calls).toHaveLength(1)
})

test("160-character exact identity is accepted", async () => {
  const f = fixture()
  const clientCommandId = "x".repeat(160)
  const fence = await acquireOfflineCommandFences(f.tx, {
    tenantId: "tenant",
    clientCommandIds: [clientCommandId],
  })
  expect(() =>
    assertOfflineCommandFence(f.tx, fence, {
      tenantId: "tenant",
      clientCommandId,
    }),
  ).not.toThrow()
  expect(f.calls).toHaveLength(1)
})
