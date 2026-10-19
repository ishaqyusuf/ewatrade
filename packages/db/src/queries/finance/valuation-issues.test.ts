import { describe, expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import {
  lockCommerceFinancialOrder,
  readHeldCommerceFinanceBook,
} from "../customer-ledger/commerce-locks"
import { FinanceError } from "./rules"
import { recordProductFulfillmentValuationInTransaction } from "./valuation-issues"

const decimal = (value: string) => ({ toFixed: () => value })
const effectiveAt = new Date("2026-09-15T12:00:00.000Z")
const actorUserId = "user-1"

function fixture(
  options: {
    before?: string
    after?: string
    issued?: string
    pool?: Record<string, unknown> | null
    movementCount?: number
    effectiveAt?: Date
    existingEvent?: Record<string, unknown> | null
    stockKind?: "SHARED_POOL" | "PACKAGED_STOCK"
    factor?: string
    book?: Record<string, unknown> | null
    missingSnapshot?: boolean
    missingFulfillment?: boolean
  } = {},
) {
  const before = options.before ?? "3"
  const after = options.after ?? "1"
  const issued = options.issued ?? "2"
  const factor = options.factor ?? "1"
  const stockKind = options.stockKind ?? "SHARED_POOL"
  const balance = {
    id: "balance-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    store: { tenantId: "tenant-1", currencyCode: "NGN" },
    variantId: "variant-1",
    inventoryUnitId: "unit-1",
    kind: stockKind,
    revision: 7,
    onHandQuantity: decimal(stockKind === "PACKAGED_STOCK" ? "1" : after),
  }
  const movement = {
    id: "movement-1",
    balanceSourceId: balance.id,
    configurationVersionId: "configuration-1",
    enteredInventoryUnitId: "unit-1",
    unitFactorSnapshot: decimal(factor),
    enteredQuantity: decimal(issued === "12" ? "1" : issued),
    signedCanonicalEffect: decimal(`-${issued}`),
    previousOnHandQuantity: decimal(
      stockKind === "PACKAGED_STOCK" ? "2" : before,
    ),
    resultingOnHandQuantity: decimal(
      stockKind === "PACKAGED_STOCK" ? "1" : after,
    ),
    balanceSource: balance,
    valuationEvent: options.existingEvent ?? null,
  }
  const fulfillment = {
    id: "fulfillment-1",
    quantity: decimal(issued === "12" ? "1" : issued),
    stockOperationId: "operation-1",
    orderLine: {
      id: "line-1",
      kind: "PRODUCT_UNIT",
      quantity: decimal(issued === "12" ? "1" : issued),
      snapshot: options.missingSnapshot
        ? null
        : {
            currencyCode: "NGN",
            offeringId: "offering-1",
            balanceSourceId: balance.id,
            configurationVersionId: "configuration-1",
            inventoryUnitId: "unit-1",
            unitFactor: decimal(factor),
            variantId: "variant-1",
            stockBehavior:
              stockKind === "PACKAGED_STOCK"
                ? "PACKAGED_STOCK"
                : "CANONICAL_SHARED",
          },
      offeringId: "offering-1",
      order: {
        id: "order-1",
        tenantId: "tenant-1",
        storeId: "store-1",
        currencyCode: "NGN",
        store: { tenantId: "tenant-1", currencyCode: "NGN" },
      },
    },
    reservation: {
      tenantId: "tenant-1",
      storeId: "store-1",
      offeringId: "offering-1",
      commercialOrderLineId: "line-1",
      status: "COMMITTED",
      balanceSourceId: balance.id,
      configurationVersionId: "configuration-1",
      enteredInventoryUnitId: "unit-1",
      enteredQuantity: decimal(issued === "12" ? "1" : issued),
      unitFactorSnapshot: decimal(factor),
      canonicalQuantity: decimal(issued),
    },
    stockOperation: {
      id: "operation-1",
      tenantId: "tenant-1",
      storeId: "store-1",
      type: "SALE_FULFILLMENT",
      source: "commercial_order",
      actorUserId,
      effectiveAt: options.effectiveAt ?? effectiveAt,
      movements: [movement],
    },
  }
  const book =
    options.book === null
      ? null
      : (options.book ?? {
          id: "book-1",
          tenantId: "tenant-1",
          currencyCode: "NGN",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          closedThrough: null,
        })
  const state: {
    pool: Record<string, unknown> | null
    event: Record<string, unknown> | null
  } = {
    pool: options.pool
      ? {
          id: "pool-1",
          quantity: decimal(before),
          valueMinor: BigInt(101),
          unknownReason: null,
          lastMovementCount: BigInt(2),
          lastSequence: BigInt(4),
          latestEffectiveAt: new Date("2026-09-01T00:00:00.000Z"),
          ...options.pool,
        }
      : options.pool === null
        ? null
        : {
            id: "pool-1",
            quantity: decimal(before),
            valueMinor: BigInt(101),
            unknownReason: null,
            lastMovementCount: BigInt(2),
            lastSequence: BigInt(4),
            latestEffectiveAt: new Date("2026-09-01T00:00:00.000Z"),
          },
    event: null,
  }
  const tx = {
    productFulfillment: {
      findFirst: async () => (options.missingFulfillment ? null : fulfillment),
    },
    financeBook: { findUnique: async () => book },
    financeInventoryPool: {
      findUnique: async () => state.pool,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.pool = { ...state.pool, ...data }
        return state.pool
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.pool = { id: "pool-1", ...data }
        return state.pool
      },
    },
    stockMovement: {
      count: async () => options.movementCount ?? 3,
    },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.event = data
        return data
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    state,
    fulfillment,
    movement,
    book,
  }
}

describe("Product fulfillment inventory valuation", () => {
  test("allocates known partial issue cost and the remaining value on depletion", async () => {
    const partial = fixture()
    const first = await recordProductFulfillmentValuationInTransaction(
      partial.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(first).toMatchObject({
      kind: "ISSUE",
      sourceKind: "PRODUCT_FULFILLMENT",
      quantityBefore: "3",
      quantityAfter: "1",
      valueBeforeMinor: BigInt(101),
      valueDeltaMinor: BigInt(-67),
      valueAfterMinor: BigInt(34),
      sourceCostMinor: BigInt(67),
    })

    const depletion = fixture({
      before: "1",
      after: "0",
      issued: "1",
      pool: {
        quantity: decimal("1"),
        valueMinor: BigInt(34),
        lastMovementCount: BigInt(3),
      },
      movementCount: 4,
    })
    const final = await recordProductFulfillmentValuationInTransaction(
      depletion.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(final).toMatchObject({
      quantityAfter: "0",
      valueDeltaMinor: BigInt(-34),
      valueAfterMinor: BigInt(0),
      sourceCostMinor: BigInt(34),
    })
  })

  test("keeps packaged count conversion exact and marks movement gaps unknown", async () => {
    const setup = fixture({
      before: "24",
      after: "12",
      issued: "12",
      stockKind: "PACKAGED_STOCK",
      factor: "12",
      movementCount: 5,
      pool: {
        quantity: decimal("24"),
        lastMovementCount: BigInt(2),
      },
    })
    const result = await recordProductFulfillmentValuationInTransaction(
      setup.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(result).toMatchObject({
      quantityBefore: "24",
      quantityAfter: "12",
      valueBeforeMinor: null,
      valueDeltaMinor: null,
      valueAfterMinor: null,
      sourceCostMinor: null,
      unknownReason: "UNCAPTURED_MOVEMENTS",
    })
    expect(setup.state.pool?.quantity).toBe("12")
  })

  test("retains known zero and prior unknown cost states", async () => {
    const zero = fixture({
      pool: { valueMinor: BigInt(0), lastMovementCount: BigInt(2) },
    })
    const zeroResult = await recordProductFulfillmentValuationInTransaction(
      zero.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(zeroResult).toMatchObject({
      valueBeforeMinor: BigInt(0),
      valueDeltaMinor: BigInt(0),
      valueAfterMinor: BigInt(0),
      sourceCostMinor: BigInt(0),
      unknownReason: null,
    })

    const unknown = fixture({
      pool: {
        valueMinor: null,
        unknownReason: "MISSING_OPENING_COST",
        lastMovementCount: BigInt(2),
      },
    })
    const unknownResult = await recordProductFulfillmentValuationInTransaction(
      unknown.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(unknownResult).toMatchObject({
      valueBeforeMinor: null,
      valueDeltaMinor: null,
      valueAfterMinor: null,
      sourceCostMinor: null,
      unknownReason: "MISSING_OPENING_COST",
    })
  })

  test("values an alternate transaction unit against its different canonical balance unit", async () => {
    const source = fixture({
      before: "24",
      after: "12",
      issued: "12",
      factor: "12",
      pool: { valueMinor: BigInt(1200) },
    })
    const snapshot = source.fulfillment.orderLine.snapshot
    if (!snapshot) throw new Error("Missing test snapshot")
    snapshot.stockBehavior = "ALTERNATE_TRANSACTION"
    source.movement.balanceSource.inventoryUnitId = "canonical-unit"
    const issue = await recordProductFulfillmentValuationInTransaction(
      source.tx,
      {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      },
    )
    expect(issue).toMatchObject({
      sourceCostMinor: BigInt(600),
      quantityAfter: "12",
    })
  })

  test("replays an immutable issue after later stock without current-balance checks", async () => {
    const existing = {
      tenantId: "tenant-1",
      bookId: "book-1",
      balanceSourceId: "balance-1",
      kind: "ISSUE",
      sourceKind: "PRODUCT_FULFILLMENT",
      sourceId: "fulfillment-1",
      stockOperationId: "operation-1",
      stockMovementId: "movement-1",
      canonicalEffect: decimal("-2"),
      quantityBefore: decimal("3"),
      quantityAfter: decimal("1"),
      effectiveAt,
      actorUserId,
    }
    const setup = fixture({ existingEvent: existing })
    setup.movement.balanceSource.onHandQuantity = decimal("99")
    const replay = await recordProductFulfillmentValuationInTransaction(
      setup.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(Object.is(replay, existing)).toBe(true)
    expect(setup.state.event).toBeNull()
  })

  test("rejects tenant/source mismatch and closed or chronologically stale dates", async () => {
    const wrongTenant = fixture()
    await expect(
      recordProductFulfillmentValuationInTransaction(wrongTenant.tx, {
        tenantId: "tenant-2",
        fulfillmentId: "fulfillment-1",
      }),
    ).rejects.toBeInstanceOf(FinanceError)

    const beforeBook = fixture({
      effectiveAt: new Date("2025-12-31T23:59:59Z"),
    })
    await expect(
      recordProductFulfillmentValuationInTransaction(beforeBook.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })

    const future = fixture({ effectiveAt: new Date("2099-12-31T23:59:59Z") })
    await expect(
      recordProductFulfillmentValuationInTransaction(future.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })

    const stale = fixture({
      pool: { latestEffectiveAt: new Date("2026-09-16T00:00:00Z") },
    })
    await expect(
      recordProductFulfillmentValuationInTransaction(stale.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  })

  test("preserves no-book operations and rejects missing scoped source or snapshot", async () => {
    const noBook = fixture({ book: null, missingSnapshot: true })
    expect(
      await recordProductFulfillmentValuationInTransaction(noBook.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      }),
    ).toBeNull()

    const missingSource = fixture({ missingFulfillment: true })
    await expect(
      recordProductFulfillmentValuationInTransaction(missingSource.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    const missingSnapshot = fixture({ missingSnapshot: true })
    await expect(
      recordProductFulfillmentValuationInTransaction(missingSnapshot.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

// The issuer and Book proof are actual production functions. Only database
// ports are inert. Default-call cases above retain their original surface.
async function heldFixture(options: Parameters<typeof fixture>[0] = {}) {
  const base = fixture(options)
  const calls = {
    sources: [] as unknown[],
    bookReads: 0,
    redundant: [] as string[],
    poolWrites: 0,
    eventWrites: 0,
  }
  let movementCount = options.movementCount ?? 3
  let responseTransform:
    | ((balance: Record<string, unknown>) => void)
    | undefined
  const lockedOrder = {
    id: "order-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    currencyCode: "NGN",
    customerId: null,
  }
  const snapshot = base.fulfillment.orderLine.snapshot
  if (snapshot)
    snapshot.unitFactor = new Prisma.Decimal(snapshot.unitFactor.toFixed())
  base.fulfillment.quantity = new Prisma.Decimal(
    base.fulfillment.quantity.toFixed(),
  )
  base.fulfillment.orderLine.quantity = new Prisma.Decimal(
    base.fulfillment.orderLine.quantity.toFixed(),
  )
  base.movement.unitFactorSnapshot = new Prisma.Decimal(
    base.movement.unitFactorSnapshot.toFixed(),
  )
  if (base.state.pool)
    base.state.pool.quantity = new Prisma.Decimal(options.before ?? "3")
  const refuseRead = (name: string): never => {
    calls.redundant.push(name)
    throw Error(`Redundant ${name} read`)
  }
  const writePool = (data: Record<string, unknown>) => {
    calls.poolWrites++
    if (typeof data.quantity !== "string")
      throw Error("Expected exact pool quantity")
    base.state.pool = {
      id: "pool-1",
      ...base.state.pool,
      ...data,
      quantity: new Prisma.Decimal(data.quantity),
    }
    return base.state.pool
  }
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?")
      if (sql.includes('FROM "FinanceBook"'))
        return base.book ? [{ id: "book-1" }] : []
      if (sql.includes('FROM "CommercialOrder"')) return [{ ...lockedOrder }]
      throw Error("Unexpected lock port")
    },
    commercialOrder: { findFirst: async () => ({ ...lockedOrder }) },
    productFulfillment: {
      findFirst: async (args: unknown) => {
        calls.sources.push(args)
        if (options.missingFulfillment) return null
        // Return fresh DB-shaped state for EVERY source read, including the
        // effects of an earlier issue in this same transaction.
        return {
          ...base.fulfillment,
          stockOperation: {
            ...base.fulfillment.stockOperation,
            movements: base.fulfillment.stockOperation.movements.map(
              (movement) => {
                const balanceSource = {
                  ...movement.balanceSource,
                  financeInventoryPools: base.state.pool
                    ? [{ ...base.state.pool }]
                    : [],
                  _count: { movements: movementCount },
                }
                responseTransform?.(balanceSource)
                return { ...movement, balanceSource }
              },
            ),
          },
        }
      },
    },
    financeBook: {
      findUnique: async () => refuseRead("Book"),
      findUniqueOrThrow: async () => {
        calls.bookReads++
        if (!base.book) throw Error("Absent Book cannot be read")
        return base.book
      },
    },
    financeInventoryPool: {
      findUnique: async () => refuseRead("pool"),
      update: async ({ data }: { data: Record<string, unknown> }) =>
        writePool(data),
      create: async ({ data }: { data: Record<string, unknown> }) =>
        writePool(data),
    },
    stockMovement: { count: async () => refuseRead("movement count") },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.eventWrites++
        base.state.event = data
        return data
      },
    },
  } as unknown as Prisma.TransactionClient
  const held = await lockCommerceFinancialOrder(tx, {
    tenantId: lockedOrder.tenantId,
    orderId: lockedOrder.id,
  })
  if (!held) throw Error("Actual issuer did not return a lock")
  // Model the actual payment path having loaded this same held Book already.
  await readHeldCommerceFinanceBook(tx, held, {
    tenantId: lockedOrder.tenantId,
    orderId: lockedOrder.id,
  })
  return {
    ...base,
    tx,
    held,
    calls,
    setMovementCount: (count: number) => {
      movementCount = count
    },
    setProjectionTransform: (
      transform: (balance: Record<string, unknown>) => void,
    ) => {
      responseTransform = transform
    },
  }
}

function invokeHeld(
  f: Awaited<ReturnType<typeof heldFixture>>,
  proof: unknown = f.held,
  input = { tenantId: "tenant-1", fulfillmentId: f.fulfillment.id },
) {
  // Reflect permits runtime RED against the original two-argument function;
  // the intended third argument is always a real issuer's evidence or an
  // explicit adversarial input, never a test-minted positive proof.
  return Reflect.apply(
    recordProductFulfillmentValuationInTransaction,
    undefined,
    [f.tx, input, proof],
  )
}

function expectJoinedScope(f: Awaited<ReturnType<typeof heldFixture>>) {
  expect(f.calls.sources.at(-1)).toMatchObject({
    relationLoadStrategy: "join",
    where: {
      id: f.fulfillment.id,
      orderLine: { order: { tenantId: "tenant-1" } },
    },
    include: {
      stockOperation: {
        include: {
          movements: {
            include: {
              balanceSource: {
                include: {
                  financeInventoryPools: { where: { bookId: "book-1" } },
                  _count: { select: { movements: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  expect(f.calls.bookReads).toBe(1)
  expect(f.calls.redundant).toEqual([])
}

test("held Product issue reuses the actual Book proof and joined current pool/history", async () => {
  const f = await heldFixture()
  const result = await invokeHeld(f)
  expect(result).toMatchObject({
    sourceCostMinor: 67n,
    valueAfterMinor: 34n,
    quantityAfter: "1",
  })
  expectJoinedScope(f)
  expect(f.calls.poolWrites).toBe(1)
  expect(f.calls.eventWrites).toBe(1)
  expect(f.state.pool?.quantity).toBeInstanceOf(Prisma.Decimal)
})

test("missing joined pool projection is refused rather than inferred as an absent pool", async () => {
  const f = await heldFixture()
  f.setProjectionTransform((balance) => {
    Reflect.deleteProperty(balance, "financeInventoryPools")
  })
  const error = await invokeHeld(f).then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(FinanceError)
  expect(error).toMatchObject({ code: "CONFLICT" })
  expect(f.calls.poolWrites).toBe(0)
  expect(f.calls.eventWrites).toBe(0)
  expect(f.calls.redundant).toEqual([])
})

test("missing or invalid joined movement count refuses without guessing or extra reads", async () => {
  const invalidCounts = [
    undefined,
    null,
    -1,
    0,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "3",
  ]
  for (const projectedCount of [
    undefined,
    null,
    {},
    ...invalidCounts.map((movements) => ({ movements })),
  ]) {
    const f = await heldFixture()
    f.setProjectionTransform((balance) => {
      if (projectedCount === undefined)
        Reflect.deleteProperty(balance, "_count")
      else balance._count = projectedCount
    })
    const error = await invokeHeld(f).then(
      () => null,
      (reason: unknown) => reason,
    )
    expect(error).toBeInstanceOf(FinanceError)
    expect(error).toMatchObject({ code: "CONFLICT" })
    expect(f.calls.poolWrites).toBe(0)
    expect(f.calls.eventWrites).toBe(0)
    expect(f.calls.redundant).toEqual([])
  }
})

for (const [label, options, expected] of [
  [
    "known zero",
    { pool: { valueMinor: 0n } },
    { sourceCostMinor: 0n, valueAfterMinor: 0n, unknownReason: null },
  ],
  [
    "prior unknown",
    { pool: { valueMinor: null, unknownReason: "PRIOR_UNKNOWN_COST" } },
    {
      sourceCostMinor: null,
      valueAfterMinor: null,
      unknownReason: "PRIOR_UNKNOWN_COST",
    },
  ],
  [
    "missing pool",
    { pool: null },
    {
      sourceCostMinor: null,
      valueAfterMinor: null,
      unknownReason: "MISSING_OPENING_COST",
    },
  ],
  [
    "movement gap",
    { movementCount: 5 },
    {
      sourceCostMinor: null,
      valueAfterMinor: null,
      unknownReason: "UNCAPTURED_MOVEMENTS",
    },
  ],
] as const) {
  test(`joined issue retains ${label} semantics`, async () => {
    const f = await heldFixture(options)
    expect(await invokeHeld(f)).toMatchObject(expected)
    expectJoinedScope(f)
  })
}

test("joined issue retains real Decimal fractions and BigInt carrying value beyond safe Number", async () => {
  const huge = await heldFixture({ pool: { valueMinor: 9007199254740993n } })
  expect(await invokeHeld(huge)).toMatchObject({
    sourceCostMinor: 6004799503160662n,
    valueAfterMinor: 3002399751580331n,
  })
  expectJoinedScope(huge)
  const fractional = await heldFixture({
    before: "3.000000000000000001",
    after: "1.000000000000000001",
  })
  expect(await invokeHeld(fractional)).toMatchObject({
    quantityBefore: "3.000000000000000001",
    quantityAfter: "1.000000000000000001",
    sourceCostMinor: 67n,
    valueAfterMinor: 34n,
  })
  expectJoinedScope(fractional)
})

test("a second same-balance issue reloads the pool written by the first under the same lock", async () => {
  const f = await heldFixture()
  expect(await invokeHeld(f)).toMatchObject({
    sourceCostMinor: 67n,
    valueAfterMinor: 34n,
    sequence: 5n,
  })
  f.fulfillment.id = "fulfillment-2"
  f.fulfillment.stockOperationId = f.fulfillment.stockOperation.id =
    "operation-2"
  f.fulfillment.orderLine.id = f.fulfillment.reservation.commercialOrderLineId =
    "line-2"
  f.fulfillment.quantity = f.fulfillment.orderLine.quantity =
    new Prisma.Decimal(1)
  f.fulfillment.reservation.enteredQuantity =
    f.fulfillment.reservation.canonicalQuantity = new Prisma.Decimal(1)
  f.movement.id = "movement-2"
  f.movement.enteredQuantity = new Prisma.Decimal(1)
  f.movement.signedCanonicalEffect = new Prisma.Decimal(-1)
  f.movement.previousOnHandQuantity = new Prisma.Decimal(1)
  f.movement.resultingOnHandQuantity = f.movement.balanceSource.onHandQuantity =
    new Prisma.Decimal(0)
  f.movement.balanceSource.revision++
  f.setMovementCount(4)
  expect(await invokeHeld(f)).toMatchObject({
    sourceCostMinor: 34n,
    valueAfterMinor: 0n,
    quantityAfter: "0",
    sequence: 6n,
  })
  expect(f.calls.sources).toHaveLength(2)
  expect(f.calls.eventWrites).toBe(2)
  expectJoinedScope(f)
})

for (const denial of ["forged", "other transaction", "other Tenant"] as const) {
  test(`held issue refuses ${denial} evidence before source reads or effects`, async () => {
    const f = await heldFixture()
    let proof: unknown = f.held
    if (denial === "forged") proof = { ...f.held }
    if (denial === "other transaction") proof = (await heldFixture()).held
    await expect(
      invokeHeld(f, proof, {
        tenantId: denial === "other Tenant" ? "tenant-2" : "tenant-1",
        fulfillmentId: f.fulfillment.id,
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
    expect(f.calls.sources).toHaveLength(0)
    expect(f.calls.redundant).toEqual([])
    expect(f.calls.poolWrites).toBe(0)
    expect(f.calls.eventWrites).toBe(0)
  })
}

for (const denial of [
  "different Order",
  "foreign reservation",
  "closed date",
  "later pool",
] as const) {
  test(`held optimization retains ${denial} refusal with zero effects`, async () => {
    const f = await heldFixture(
      denial === "later pool"
        ? { pool: { latestEffectiveAt: new Date("2026-09-16T00:00:00Z") } }
        : denial === "closed date"
          ? {
              book: {
                id: "book-1",
                tenantId: "tenant-1",
                currencyCode: "NGN",
                startsAt: new Date("2026-01-01T00:00:00Z"),
                closedThrough: new Date("2026-09-16T00:00:00Z"),
              },
            }
          : {},
    )
    if (denial === "different Order")
      f.fulfillment.orderLine.order.id = "other-order"
    if (denial === "foreign reservation")
      f.fulfillment.reservation.storeId = "other-store"
    await expect(invokeHeld(f)).rejects.toMatchObject({
      code:
        denial === "different Order"
          ? "REVISION_CONFLICT"
          : denial === "foreign reservation"
            ? "CONFLICT"
            : denial === "closed date"
              ? "CLOSED_PERIOD"
              : "INVALID_JOURNAL",
    })
    expect(f.calls.poolWrites).toBe(0)
    expect(f.calls.eventWrites).toBe(0)
    expect(f.calls.redundant).toEqual([])
  })
}

test("held no-Book keeps the existing no-costing behavior and missing source still refuses", async () => {
  const absent = await heldFixture({ book: null, missingSnapshot: true })
  expect(await invokeHeld(absent)).toBeNull()
  expect(absent.calls.poolWrites).toBe(0)
  expect(absent.calls.eventWrites).toBe(0)
  expect(absent.calls.bookReads).toBe(0)
  expect(absent.calls.redundant).toEqual([])
  const missing = await heldFixture({ missingFulfillment: true })
  await expect(invokeHeld(missing)).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(missing.calls.poolWrites).toBe(0)
  expect(missing.calls.eventWrites).toBe(0)
})
