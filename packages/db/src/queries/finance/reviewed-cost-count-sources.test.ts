import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { readReviewedCostCountSources as readSources } from "./reviewed-cost-count-sources"

function fixture(size = 1) {
  const calls: string[] = []
  const effectiveAt = new Date("2026-09-15T12:00:00.000Z")
  const store = { id: "store", tenantId: "tenant", currencyCode: "NGN" }
  const unit = {
    id: "unit",
    configurationVersionId: "version",
    factor: new Prisma.Decimal(1),
    transactionScale: 3,
  }
  const balance = {
    id: "balance",
    tenantId: "tenant",
    storeId: store.id,
    kind: "SHARED_POOL",
    inventoryUnitId: unit.id,
    inventoryUnit: unit,
    store,
  }
  const zeroBalance = { ...balance, id: "zero-balance" }
  const counts = Array.from({ length: size }, (_, i) => ({
    id: `count-${i}`,
    tenantId: "tenant",
    storeId: store.id,
    store,
    status: "FINALIZED",
    finalizedAt: effectiveAt,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    finalizedOperationId: `operation-${i}`,
    _count: { lines: 2 },
  }))
  const lines = counts.flatMap((count) => [
    {
      id: `${count.id}-shortage`,
      stockCountId: count.id,
      balanceSourceId: balance.id,
      configurationVersionId: unit.configurationVersionId,
      balanceSource: balance,
      expectedQuantity: new Prisma.Decimal("2"),
      observedQuantity: new Prisma.Decimal("1"),
      varianceQuantity: new Prisma.Decimal("-1"),
    },
    {
      id: `${count.id}-zero`,
      stockCountId: count.id,
      balanceSourceId: zeroBalance.id,
      configurationVersionId: unit.configurationVersionId,
      balanceSource: zeroBalance,
      expectedQuantity: new Prisma.Decimal("0"),
      observedQuantity: new Prisma.Decimal("0"),
      varianceQuantity: new Prisma.Decimal("0"),
    },
  ])
  const graphs = counts.map((count) => ({
    id: count.finalizedOperationId,
    tenantId: "tenant",
    storeId: store.id,
    store,
    type: "COUNT_RECONCILIATION",
    source: "stock_count",
    actorUserId: "actor",
    effectiveAt,
    movements: [
      {
        id: `${count.id}-movement`,
        operationId: count.finalizedOperationId,
        balanceSourceId: balance.id,
        balanceSource: balance,
        reversalOfMovementId: null,
        configurationVersionId: unit.configurationVersionId,
        enteredInventoryUnitId: unit.id,
        transactionScaleSnapshot: unit.transactionScale,
        unitFactorSnapshot: unit.factor,
        enteredQuantity: new Prisma.Decimal("1"),
        signedCanonicalEffect: new Prisma.Decimal("-1"),
        previousOnHandQuantity: new Prisma.Decimal("2"),
        resultingOnHandQuantity: new Prisma.Decimal("1"),
        valuationEvent: null,
      },
    ],
  }))
  const documents = [
    ...counts.map((row) => ({ kind: "COUNT", id: row.id })),
    ...lines.map((row) => ({ kind: "COUNT_LINE", id: row.id })),
  ]
  const data = { counts, lines }
  const tx = {
    stockCount: {
      findMany: async () => {
        calls.push("stockCount")
        return data.counts
      },
    },
    stockCountLine: {
      findMany: async () => {
        calls.push("stockCountLine")
        return data.lines
      },
    },
  } as unknown as Prisma.TransactionClient
  const input = {
    owners: counts.map((row) => ({ id: row.finalizedOperationId })),
    graphs,
    discovery: { sourceDocumentReferences: documents },
    book: { id: "book", tenantId: "tenant", currencyCode: "NGN" },
  } as unknown as Parameters<typeof readSources>[1]
  return { tx, input, data, documents, graphs, calls }
}

test("complete Count proof retains zero siblings without inventing a movement", async () => {
  const f = fixture()
  const sources = await readSources(f.tx, f.input)
  expect(sources[0]?.count.lines.map((line) => line.id)).toEqual([
    "count-0-shortage",
    "count-0-zero",
  ])
  expect(sources[0]?.nonzeroLines.map((line) => line.effect)).toEqual(["-1"])
})

test("4,096 Count documents use two reads with complete zero and nonzero lines", async () => {
  const f = fixture(4096)
  const sources = await readSources(f.tx, f.input)
  expect(sources).toHaveLength(4096)
  expect(sources.reduce((n, source) => n + source.count.lines.length, 0)).toBe(
    8192,
  )
  expect(sources.reduce((n, source) => n + source.nonzeroLines.length, 0)).toBe(
    4096,
  )
  expect(f.calls).toEqual(["stockCount", "stockCountLine"])
})

test("missing zero line fails instead of accepting the movement-only subset", async () => {
  const f = fixture()
  f.data.lines = f.data.lines.slice(0, 1)
  await expect(readSources(f.tx, f.input)).rejects.toThrow(
    "line coverage changed",
  )
})

test("unchanged line total cannot conceal a moved Count owner", async () => {
  const f = fixture(2)
  const zero = f.data.lines[1]
  if (!zero) throw new Error("Fixture zero line missing")
  zero.stockCountId = "count-1"
  await expect(readSources(f.tx, f.input)).rejects.toThrow(
    "line coverage changed",
  )
})

for (const kind of ["COUNT", "COUNT_LINE"]) {
  test(`refuses ${kind} identities outside the coordinated discovery`, async () => {
    const f = fixture()
    const index = f.documents.findIndex((row) => row.kind === kind)
    f.documents.splice(index, 1)
    await expect(readSources(f.tx, f.input)).rejects.toThrow(
      "line coverage changed",
    )
  })
}

test("complete IDs still require original zero-line quantity proof", async () => {
  const f = fixture()
  const zero = f.data.lines[1]
  if (!zero) throw new Error("Fixture zero line missing")
  zero.expectedQuantity = new Prisma.Decimal("0.25")
  await expect(readSources(f.tx, f.input)).rejects.toThrow(
    "line quantity snapshots are inconsistent",
  )
})

test("extra reconciliation movement cannot hide behind complete Count lines", async () => {
  const f = fixture()
  const graph = f.graphs[0]
  const first = graph?.movements[0]
  if (!graph || !first) throw new Error("Fixture movement missing")
  graph.movements.push({ ...first, id: "extra-movement" })
  await expect(readSources(f.tx, f.input)).rejects.toThrow(
    "duplicate reconciliation movements",
  )
})

test("line aggregate above the identity budget rejects before hydration", async () => {
  const f = fixture()
  const count = f.data.counts[0]
  if (!count) throw new Error("Fixture Count missing")
  count._count.lines = 32769
  await expect(readSources(f.tx, f.input)).rejects.toThrow(
    "line coverage changed",
  )
  expect(f.calls).toEqual(["stockCount"])
})
