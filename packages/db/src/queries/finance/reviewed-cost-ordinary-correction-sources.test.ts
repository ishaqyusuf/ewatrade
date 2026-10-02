import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import {
  book,
  ordinaryCorrectionFixture,
  persistedPair,
} from "./inventory-ordinary-correction-test-fixture"
import { proveReviewedOrdinaryCorrectionSources as prove } from "./reviewed-cost-ordinary-correction-sources"
import { readReviewedCostOwningSourcesInTransaction as readOwners } from "./reviewed-cost-owners"
import { recordOrdinaryStockCorrectionValuationInTransaction as writeCorrection } from "./valuation-ordinary-corrections"

function retained(value: unknown): unknown {
  if (value instanceof Date || value === null) return value
  if (Array.isArray(value)) return value.map(retained)
  if (value && typeof value === "object") {
    if ("toFixed" in value && typeof value.toFixed === "function")
      return new Prisma.Decimal(value.toFixed())
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, retained(v)]),
    )
  }
  return value
}
async function fixture(
  options: Parameters<typeof ordinaryCorrectionFixture>[0] & {
    gain?: boolean
  } = { packaged: true },
) {
  const f = ordinaryCorrectionFixture({
    ...options,
    unknownPool: options?.unknownPool || options?.gain,
  })
  if (options?.gain) {
    const factor = options.packaged ? 12 : 1
    const d = (n: number) => ({ toFixed: () => String(n) })
    Object.assign(f.originalMovement, {
      previousOnHandQuantity: d(3),
      resultingOnHandQuantity: d(5),
      signedCanonicalEffect: d(2 * factor),
    })
    if (f.originalMovement.valuationEvent)
      Object.assign(f.originalMovement.valuationEvent, {
        canonicalEffect: d(2 * factor),
        quantityBefore: d(3 * factor),
        quantityAfter: d(5 * factor),
        sourceCostMinor: null,
        valueBeforeMinor: null,
        valueDeltaMinor: null,
        valueAfterMinor: null,
        unknownReason: "UNCAPTURED_MOVEMENTS",
      })
    Object.assign(f.correction.movements[0] ?? {}, {
      signedCanonicalEffect: d(-2 * factor),
      previousOnHandQuantity: d(4),
      resultingOnHandQuantity: d(2),
    })
    Object.assign(f.replacementMovement, {
      signedCanonicalEffect: d(factor),
      previousOnHandQuantity: d(2),
      resultingOnHandQuantity: d(3),
    })
    f.originalMovement.balanceSource.onHandQuantity = d(3)
  }
  await writeCorrection(f.tx, {
    tenantId: book.tenantId,
    stockOperationId: f.correction.id,
    expectedStockRevision: 3,
  })
  const events = persistedPair(
    f.savedEvents,
    String(f.savedEvents[0]?.poolId ?? "pool-1"),
  )
  f.correction.movements.forEach((m, i) => {
    m.valuationEvent = events[i] ?? null
  })
  const raw = [f.correction.correctionOf, f.correction]
  const graphs = retained(
    raw.map((g) => ({
      ...g,
      linkedOperationId: null,
      _count: {
        ...g._count,
        movements: g.movements.length,
        corrections: g.id === f.correction.id ? 0 : 1,
      },
      purchaseReceipts: [],
      productFulfillments: [],
      productReturns: [],
      dispatchedTransfers: [],
      receivedTransfers: [],
      cancelledTransfers: [],
      movements: g.movements.map((m) => ({
        ...m,
        balanceSource: {
          ...m.balanceSource,
          variantId: "variant-1",
          product: {
            id: "product-1",
            catalogItemId: "item-1",
            catalogItem: { id: "item-1", tenantId: book.tenantId },
          },
          variant: { id: "variant-1", catalogItemId: "item-1" },
        },
      })),
    })),
  ) as Parameters<typeof prove>[0]["graphs"]
  const input = {
    graphs,
    correctionIds: [f.correction.id],
    book,
    discovery: {
      tenantId: book.tenantId,
      bookId: book.id,
      currencyCode: book.currencyCode,
      operationIds: graphs.map((g) => g.id),
      movementIds: graphs.flatMap((g) => g.movements.map((m) => m.id)),
      balanceSourceIds: ["balance-1"],
      rootBalanceSourceIds: ["balance-1"],
      transferIds: [],
      reviewAllocationIds: [],
      orderLineIds: [],
      productReturnIds: [],
      bookSequence: 0n,
      sourceDiscoveryHash: "a".repeat(64),
      requiresOwningSourceProof: true as const,
      requiresMonetaryProof: true as const,
    } satisfies Parameters<typeof prove>[0]["discovery"],
  }
  const original = graphs[0]
  const correction = graphs[1]
  if (!original || !correction) throw new Error("Missing correction fixture")
  const originalMovement = original.movements[0]
  const inverse = correction.movements[0]
  const replacement = correction.movements[1]
  if (!originalMovement || !inverse || !replacement)
    throw new Error("Missing original movement group")
  return {
    input,
    original,
    correction,
    originalMovement,
    inverse,
    replacement,
    read: () => prove(input),
  }
}

test("packaged and shared corrections recover exact original costs and ignore later mutable stock", async () => {
  for (const packaged of [true, false]) {
    const f = await fixture({ packaged })
    f.originalMovement.balanceSource.onHandQuantity = new Prisma.Decimal("999")
    f.originalMovement.balanceSource.revision = 999
    const source = f.read()[0]
    expect(source?.saved?.inverseEvent.sourceCostMinor).toBe(
      packaged ? 240n : 200n,
    )
    expect(source?.saved?.replacementEvent.sourceCostMinor).toBe(
      packaged ? 120n : 100n,
    )
    expect(source?.originalCanonical).toBe(packaged ? "24" : "2")
  }
})
test("restored original cost remains known while current pool carries UNKNOWN", async () => {
  const f = await fixture({ packaged: true, unknownPool: true })
  const saved = f.read()[0]?.saved
  expect(saved?.inverseEvent.sourceCostMinor).toBe(240n)
  expect(saved?.inverseEvent.valueAfterMinor).toBeNull()
  expect(saved?.replacementEvent.sourceCostMinor).toBeNull()
})
test("legacy original and absent pair do not establish original registration", async () => {
  const f = await fixture({ legacy: true })
  expect(f.read()[0]?.targetEvent).toBeNull()
  f.inverse.valuationEvent = null
  f.replacement.valuationEvent = null
  expect(f.read()[0]?.saved).toBeNull()
})
const mutations: Array<
  [string, (f: Awaited<ReturnType<typeof fixture>>) => void]
> = [
  [
    "missing actual original",
    (f) => {
      f.input.graphs = [f.correction]
    },
  ],
  [
    "outside original movement",
    (f) => {
      f.input.discovery.movementIds = f.input.discovery.movementIds.filter(
        (id) => id !== f.originalMovement.id,
      )
    },
  ],
  [
    "outside balance",
    (f) => {
      f.input.discovery.balanceSourceIds = []
    },
  ],
  [
    "duplicate group",
    (f) => {
      f.input.correctionIds.push(f.correction.id)
    },
  ],
  [
    "foreign Product",
    (f) => {
      f.inverse.balanceSource.product.catalogItem.tenantId = "foreign"
    },
  ],
  [
    "wrong Variant membership",
    (f) => {
      f.replacement.balanceSource.variant.catalogItemId = "foreign"
    },
  ],
  [
    "ambiguous original correction count",
    (f) => {
      f.original._count.corrections = 2
    },
  ],
  [
    "corrected correction",
    (f) => {
      f.correction._count.corrections = 1
    },
  ],
  [
    "competing original owner",
    (f) => {
      f.original._count.productReturns = 1
    },
  ],
  [
    "competing correction owner",
    (f) => {
      f.correction._count.finalizedCounts = 1
    },
  ],
  [
    "wrong original relation",
    (f) => {
      f.correction.correctionOfOperationId = "foreign"
    },
  ],
  [
    "wrong inverse link",
    (f) => {
      f.inverse.reversalOfMovementId = "foreign"
    },
  ],
  [
    "wrong replacement link",
    (f) => {
      f.replacement.reversalOfMovementId = f.originalMovement.id
    },
  ],
  [
    "unit factor",
    (f) => {
      f.inverse.unitFactorSnapshot = new Prisma.Decimal("11")
    },
  ],
  [
    "partial saved group",
    (f) => {
      f.replacement.valuationEvent = null
    },
  ],
  [
    "restored allocation",
    (f) => {
      if (f.inverse.valuationEvent)
        f.inverse.valuationEvent.sourceCostMinor = 239n
    },
  ],
  [
    "replacement sequence",
    (f) => {
      if (f.replacement.valuationEvent)
        f.replacement.valuationEvent.sequence = 99n
    },
  ],
  [
    "original event scope",
    (f) => {
      if (f.originalMovement.valuationEvent)
        f.originalMovement.valuationEvent.pool.bookId = "foreign"
    },
  ],
]
for (const [name, mutate] of mutations)
  test(`refuses ${name}`, async () => {
    const f = await fixture()
    mutate(f)
    expect(f.read).toThrow()
  })

test("corrected ordinary gains retain UNKNOWN inverse/replacement rather than restoration", async () => {
  for (const packaged of [false, true]) {
    const f = await fixture({ gain: true, packaged })
    const source = f.read()[0]
    expect(source?.originalEffectNegative).toBe(false)
    expect(source?.saved?.inverseEvent.sourceCostMinor).toBeNull()
    expect(source?.saved?.replacementEvent.unknownReason).toBe(
      "UNCAPTURED_MOVEMENTS",
    )
  }
})

async function ownerFixture(
  options: Parameters<typeof fixture>[0] = { packaged: true },
) {
  const f = await fixture(options)
  const balance = f.originalMovement.balanceSource
  const unit = f.originalMovement.enteredInventoryUnit
  const tx = {
    stockOperation: { findMany: async () => f.input.graphs },
    stockMovement: {
      findMany: async () => f.input.graphs.flatMap((g) => g.movements),
    },
    stockBalanceSource: { findMany: async () => [balance] },
    inventoryUnit: { findMany: async () => [unit] },
    unitConfigurationVersion: {
      findMany: async () => [
        { ...unit.configurationVersion, id: unit.configurationVersionId },
      ],
    },
    store: { findMany: async () => [f.original.store] },
    catalogProduct: { findMany: async () => [balance.product] },
    sellableVariant: { findMany: async () => [balance.variant] },
    financeInventoryPool: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        const event =
          f.originalMovement.valuationEvent ?? f.inverse.valuationEvent
        return event && where.id.in.includes(event.poolId) ? [event.pool] : []
      },
    },
  } as unknown as Prisma.TransactionClient
  const returns = {
    snapshot: { ...book, fulfillments: [], returns: [] },
    issues: [],
  } as unknown as Parameters<typeof readOwners>[3]
  return {
    ...f,
    readOwners: () =>
      readOwners(
        tx,
        {
          tenantId: book.tenantId,
          bookId: book.id,
          actorUserId: "actor",
          through: new Date("2026-10-01T00:00:00Z"),
        },
        f.input.discovery,
        returns,
      ),
  }
}
test("actual owner reader binds ordinary original and both correction legs without changing other source families", async () => {
  const f = await ownerFixture()
  const proof = await f.readOwners()
  expect(proof.blockers).toEqual([])
  expect(proof.semantics).toEqual(
    expect.arrayContaining([
      {
        movementId: f.originalMovement.id,
        kind: "WITHDRAWAL",
        purpose: "ORDINARY",
      },
      {
        movementId: f.inverse.id,
        kind: "RESTORATION",
        originalMovementId: f.originalMovement.id,
      },
      { movementId: f.replacement.id, kind: "WITHDRAWAL", purpose: "ORDINARY" },
    ]),
  )
  expect(proof.semantics).toHaveLength(3)
  expect(proof.operationBindings).toHaveLength(2)
  expect(proof.movementBindings).toHaveLength(3)
  expect(JSON.stringify(proof.snapshot)).toContain("ORDINARY_CORRECTION")
})
test("actual owner reader uses ordinary withdrawal and UNKNOWN origin semantics for a corrected gain", async () => {
  const f = await ownerFixture({ gain: true, packaged: true })
  const proof = await f.readOwners()
  expect(proof.blockers).toEqual([])
  expect(proof.semantics).toEqual(
    expect.arrayContaining([
      { movementId: f.originalMovement.id, kind: "ORIGIN" },
      { movementId: f.inverse.id, kind: "WITHDRAWAL", purpose: "ORDINARY" },
      { movementId: f.replacement.id, kind: "ORIGIN" },
    ]),
  )
  expect(proof.semantics).toHaveLength(3)
})
test("actual owner reader blocks an unregistered legacy original instead of approving its saved correction pair", async () => {
  const f = await ownerFixture({ legacy: true })
  const proof = await f.readOwners()
  expect(proof.semantics).toEqual([])
  expect(proof.blockers).toHaveLength(2)
  expect(
    proof.blockers.every((b) => b.code === "SOURCE_CONTRACT_PENDING"),
  ).toBe(true)
})
