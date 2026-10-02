import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { closeoutFixture } from "./inventory-closeout-test-fixture"
import { readReviewedCostCloseoutSources as readSources } from "./reviewed-cost-closeout-sources"

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error("Missing fixture row")
  return row
}

function fixture(size = 1, zeros = 1) {
  const calls: Array<{ name: string; take: number }> = []
  const f = closeoutFixture({ packaged: true })
  const missing = Array.from({ length: zeros }, (_, i) => ({
    ...f.balance,
    id: `zero-${i}`,
  }))
  const closeouts = Array.from({ length: size }, (_, i) => ({
    ...f.closeout,
    id: `closeout-${i}`,
    finalizedOperationId: `operation-${i}`,
    _count: { lines: zeros + 1 },
  }))
  const lines = closeouts.flatMap((closeout) => [
    { ...f.line, id: `${closeout.id}-shortage`, closeoutId: closeout.id },
    ...missing.map((balance, i) => ({
      ...f.line,
      id: `${closeout.id}-zero-${i}`,
      closeoutId: closeout.id,
      balanceSourceId: balance.id,
      expectedQuantity: new Prisma.Decimal("4"),
      declaredQuantity: new Prisma.Decimal("4"),
      varianceQuantity: new Prisma.Decimal("0"),
    })),
  ])
  const graphs = closeouts.map((closeout) => ({
    ...f.operation,
    id: closeout.finalizedOperationId,
    movements: [
      {
        ...f.movement,
        id: `${closeout.id}-movement`,
        operationId: closeout.finalizedOperationId,
        balanceSource: f.balance,
      },
    ],
    _count: { ...f.operation._count, movements: 1 },
  }))
  const documents = [
    ...closeouts.map((row) => ({ kind: "CLOSEOUT", id: row.id })),
    ...lines.map((row) => ({ kind: "CLOSEOUT_LINE", id: row.id })),
  ]
  const data = { closeouts, lines, missing }
  const tx = {
    inventoryCloseout: {
      findMany: async ({ take }: { take: number }) => {
        calls.push({ name: "closeouts", take })
        return data.closeouts
      },
    },
    inventoryCloseoutLine: {
      findMany: async ({ take }: { take: number }) => {
        calls.push({ name: "lines", take })
        return data.lines
      },
    },
    stockBalanceSource: {
      findMany: async ({ take }: { take: number }) => {
        calls.push({ name: "zero-metadata", take })
        return data.missing
      },
    },
  } as unknown as Prisma.TransactionClient
  const discovery = {
    tenantId: "tenant",
    bookId: "book",
    currencyCode: "NGN",
    balanceSourceIds: [f.balance.id, f.parent.id, ...missing.map((b) => b.id)],
    operationIds: graphs.map((g) => g.id),
    sourceDocumentReferences: documents,
  }
  const input = {
    owners: graphs,
    graphs,
    discovery,
    book: { id: "book", tenantId: "tenant", currencyCode: "NGN" },
  } as unknown as Parameters<typeof readSources>[1]
  return { f, tx, input, data, discovery, graphs, calls, documents }
}

test("complete Closeout proof retains zero siblings and exact packaged shortage", async () => {
  const f = fixture()
  const sources = await readSources(f.tx, f.input)
  expect(sources[0]?.closeout.lines.map((l) => l.id)).toEqual([
    "closeout-0-shortage",
    "closeout-0-zero-0",
  ])
  expect(
    sources[0]?.nonzeroLines.map((l) => [l.before, l.after, l.effect]),
  ).toEqual([["48", "36", "-12"]])
  expect(f.calls).toEqual([
    { name: "closeouts", take: 4097 },
    { name: "lines", take: 32769 },
    { name: "zero-metadata", take: 2 },
  ])
})

test("4,096 Closeouts and 32,768 complete lines use three bounded reads", async () => {
  const f = fixture(4096, 7)
  const sources = await readSources(f.tx, f.input)
  expect(sources).toHaveLength(4096)
  expect(sources.reduce((n, s) => n + s.closeout.lines.length, 0)).toBe(32768)
  expect(sources.reduce((n, s) => n + s.nonzeroLines.length, 0)).toBe(4096)
  expect(f.calls).toHaveLength(3)
  expect(f.calls[2]?.take).toBe(8)
})

for (const kind of ["CLOSEOUT", "CLOSEOUT_LINE"]) {
  test(`refuses uncoordinated ${kind} identity`, async () => {
    const f = fixture()
    f.documents.splice(
      f.documents.findIndex((row) => row.kind === kind),
      1,
    )
    await expect(readSources(f.tx, f.input)).rejects.toThrow(
      "line coverage changed",
    )
  })
}

for (const balanceId of ["zero-0", "root"]) {
  test(`proves zero metadata when ${balanceId} is outside the physical cost scope`, async () => {
    const f = fixture()
    f.discovery.balanceSourceIds.splice(
      f.discovery.balanceSourceIds.indexOf(balanceId),
      1,
    )
    const sources = await readSources(f.tx, f.input)
    expect(sources[0]?.closeout.lines).toHaveLength(2)
    expect(sources[0]?.nonzeroLines).toHaveLength(1)
  })
}

test("missing zero line and unchanged total moved between documents both reject", async () => {
  const f = fixture()
  f.data.lines.pop()
  await expect(readSources(f.tx, f.input)).rejects.toThrow(
    "line coverage changed",
  )
  const moved = fixture(2)
  const zero = moved.data.lines[1]
  if (!zero) throw new Error("Missing zero line")
  zero.closeoutId = "closeout-1"
  await expect(readSources(moved.tx, moved.input)).rejects.toThrow(
    "line coverage changed",
  )
})

test("metadata overflow, duplication and missing zero metadata cannot conceal scope", async () => {
  for (const change of ["missing", "duplicate", "foreign"] as const) {
    const f = fixture()
    const zero = f.data.missing[0]
    if (!zero) throw new Error("Missing zero metadata")
    if (change === "missing") f.data.missing.pop()
    if (change === "duplicate") f.data.missing.push(zero)
    if (change === "foreign") zero.id = "foreign"
    await expect(readSources(f.tx, f.input)).rejects.toThrow(
      "line coverage changed",
    )
  }
})

test("complete zero metadata still proves actual custody, parent, Product, variant and unit", async () => {
  const probes = [
    (f: ReturnType<typeof fixture>) => {
      first(f.data.missing).custodyReferenceId = "foreign"
    },
    (f: ReturnType<typeof fixture>) => {
      first(f.data.missing).parentBalanceSource = {
        ...f.f.parent,
        variantId: "foreign",
      }
    },
    (f: ReturnType<typeof fixture>) => {
      first(f.data.missing).productId = "foreign"
    },
    (f: ReturnType<typeof fixture>) => {
      first(f.data.missing).variantId = "foreign"
    },
    (f: ReturnType<typeof fixture>) => {
      first(f.data.missing).inventoryUnitId = "foreign"
    },
    (f: ReturnType<typeof fixture>) => {
      first(f.data.missing).inventoryUnit = {
        ...f.f.unit,
        configurationVersion: { id: "configuration", productId: "foreign" },
      }
    },
  ]
  for (const mutate of probes) {
    const f = fixture()
    mutate(f)
    await expect(readSources(f.tx, f.input)).rejects.toThrow(
      "ownership is inconsistent",
    )
  }
})

test("line aggregate overflow rejects before hydration; owner overflow before any read", async () => {
  const f = fixture()
  first(f.data.closeouts)._count.lines = 32769
  await expect(readSources(f.tx, f.input)).rejects.toThrow(
    "line coverage changed",
  )
  expect(f.calls.map((c) => c.name)).toEqual(["closeouts"])
  const overflow = fixture(4097)
  await expect(readSources(overflow.tx, overflow.input)).rejects.toThrow(
    "line coverage changed",
  )
  expect(overflow.calls).toHaveLength(0)
})

for (const field of ["id", "tenantId", "currencyCode"] as const) {
  test(`held Book ${field} cannot differ from discovery`, async () => {
    const f = fixture()
    f.input.book[field] = "foreign"
    await expect(readSources(f.tx, f.input)).rejects.toThrow(
      "line coverage changed",
    )
    expect(f.calls).toHaveLength(0)
  })
}

test("duplicate or substituted operation identities fail before source projection", async () => {
  const duplicate = fixture(2)
  duplicate.input.owners.push(first(duplicate.input.owners))
  await expect(readSources(duplicate.tx, duplicate.input)).rejects.toThrow(
    "line coverage changed",
  )
  expect(duplicate.calls).toHaveLength(0)
  const substituted = fixture()
  first(substituted.data.closeouts).finalizedOperationId = "foreign"
  await expect(readSources(substituted.tx, substituted.input)).rejects.toThrow(
    "line coverage changed",
  )
})

for (const gain of [false, true]) {
  test(`batched composed ${gain ? "UNKNOWN gain" : "known shortage"} retains complete saved cost proof`, async () => {
    const { closeoutValuationFixture } = await import(
      "./inventory-closeout-test-fixture"
    )
    const {
      assertSavedInventoryCloseoutSource,
      recordInventoryCloseoutValuationInTransaction,
    } = await import("./valuation-closeouts")
    const f = closeoutValuationFixture({ packaged: true, gain })
    await recordInventoryCloseoutValuationInTransaction(f.tx, {
      tenantId: "tenant",
      closeoutId: "closeout",
    })
    Object.assign(f.tx, {
      inventoryCloseout: {
        findMany: async () => [{ ...f.closeout, _count: { lines: 1 } }],
      },
      inventoryCloseoutLine: { findMany: async () => [f.line] },
    })
    const graph = {
      ...f.operation,
      movements: [{ ...f.movement, balanceSource: f.balance }],
      _count: { ...f.operation._count, movements: 1 },
    }
    const sources = await readSources(f.tx, {
      owners: [graph],
      graphs: [graph],
      book: f.book,
      discovery: {
        tenantId: "tenant",
        bookId: "book",
        currencyCode: "NGN",
        operationIds: ["operation"],
        balanceSourceIds: ["balance", "root"],
        sourceDocumentReferences: [
          { kind: "CLOSEOUT", id: "closeout" },
          { kind: "CLOSEOUT_LINE", id: "line" },
        ],
      },
    } as unknown as Parameters<typeof readSources>[1])
    const source = first(sources)
    const events = assertSavedInventoryCloseoutSource(source)
    expect(events).toHaveLength(1)
    expect(events[0]?.sourceCostMinor).toBe(gain ? null : 25n)
    expect(events[0]?.valueAfterMinor).toBe(gain ? null : 76n)
    expect(events[0]?.unknownReason).toBe(gain ? "UNCAPTURED_MOVEMENTS" : null)
    expect(source.nonzeroLines[0]?.effect).toBe(gain ? "12" : "-12")
    const reads = f.reads()
    const writes = f.writes()
    const event = first(f.events)
    if (gain) event.unknownReason = "MISSING_OPENING_COST"
    else event.sourceCostMinor = 26n
    expect(() => assertSavedInventoryCloseoutSource(source)).toThrow(
      "differs from its immutable source",
    )
    expect(f.reads()).toBe(reads)
    expect(f.writes()).toBe(writes)
  })
}

test("actual Closeout header Store cannot be replaced by its operation Store", async () => {
  const f = fixture()
  const closeout = first(f.data.closeouts)
  closeout.store = { ...closeout.store, tenantId: "foreign" }
  await expect(readSources(f.tx, f.input)).rejects.toThrow(
    "does not own an immutable custody reconciliation",
  )
})

test("all-zero finalized Closeout retains complete source proof without a movement or saved event", async () => {
  const f = closeoutFixture({ zero: true })
  const graph = {
    ...f.operation,
    _count: { ...f.operation._count, movements: 0 },
  }
  Object.assign(f.tx, {
    inventoryCloseout: {
      findMany: async () => [{ ...f.closeout, _count: { lines: 1 } }],
    },
    inventoryCloseoutLine: { findMany: async () => [f.line] },
    stockBalanceSource: { findMany: async () => [f.balance] },
  })
  const sources = await readSources(f.tx, {
    owners: [graph],
    graphs: [graph],
    book: f.book,
    discovery: {
      tenantId: "tenant",
      bookId: "book",
      currencyCode: "NGN",
      operationIds: ["operation"],
      balanceSourceIds: [],
      sourceDocumentReferences: [
        { kind: "CLOSEOUT", id: "closeout" },
        { kind: "CLOSEOUT_LINE", id: "line" },
      ],
    },
  } as unknown as Parameters<typeof readSources>[1])
  const { assertSavedInventoryCloseoutSource } = await import(
    "./valuation-closeouts"
  )
  const source = first(sources)
  expect(source.closeout.lines).toHaveLength(1)
  expect(source.nonzeroLines).toHaveLength(0)
  expect(source.operation.movements).toEqual([])
  expect(assertSavedInventoryCloseoutSource(source)).toEqual([])
})
