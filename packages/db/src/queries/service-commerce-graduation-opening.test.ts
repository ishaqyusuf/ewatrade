import { expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { openingFixture } from "./finance/inventory-opening-test-fixture"
import { graduateServiceCommerceCatalogOffering } from "./service-commerce-graduation"

const input = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  offeringId: "offering",
  clientOperationId: "create",
  expectedOfferingRevision: 0,
  confirmed: true as const,
  currencyCode: "NGN",
  fixedPriceMinor: 4500,
  draftKind: "product" as const,
  canonicalUnitName: "unit",
  category: "Goods",
  openingStockQuantity: "4",
  sku: "SKU",
  transactionScale: 3,
  variantName: "Default",
  reason: "Verified opening count",
}

function fixture(options: { noBook?: boolean; configured?: boolean } = {}) {
  const f = openingFixture({ graduation: true, noBook: options.noBook })
  const trace: string[] = []
  const version = {
    id: "version",
    productId: "product",
    status: "CURRENT",
  }
  const configuredUnit = {
    id: "case",
    configurationVersionId: "version",
    configurationVersion: version,
    stockBehavior: "PACKAGED_STOCK",
    factor: new Prisma.Decimal("12"),
    transactionScale: 0,
  }
  type ProductUnit = {
    id: string
    sku: string
    barcode: null
    inventoryUnitId: string
    inventoryUnit: typeof configuredUnit
  }
  const offering = {
    id: "offering",
    tenantId: "tenant",
    catalogItemId: "catalog",
    catalogItem: {
      id: "catalog",
      category: "Goods",
      status: "DRAFT",
      product: {
        id: "product",
        currentUnitConfigurationVersionId: options.configured
          ? "version"
          : null,
      },
      service: null,
    },
    currencyCode: "NGN",
    fixedPriceMinor: 4500,
    productUnitOffering: options.configured
      ? ({
          id: "product-unit",
          inventoryUnitId: "case",
          inventoryUnit: configuredUnit,
          sku: "SKU",
          barcode: null,
        } satisfies ProductUnit)
      : (null as ProductUnit | null),
    revision: 0,
    serviceOffering: null,
    status: "DRAFT",
    storeAvailability: [{ storeId: "store", isAvailable: false }],
    variantId: "variant",
    variant: { name: "Original", status: "DRAFT" },
  }
  let balanceCreated = false
  let receiptCreated = false
  let savedReads = 0
  let commandLocked = false
  let replayAfterLock = false
  const canonicalUnits = [f.unit]
  const tx = {
    ...f.tx,
    membership: {
      findFirst: async ({ where }: { where: unknown }) => {
        expect(where).toMatchObject({
          tenantId: "tenant",
          userId: "actor",
          role: { in: ["OWNER", "ADMIN"] },
          status: "ACTIVE",
        })
        return { id: "membership" }
      },
    },
    store: {
      findFirst: async () => ({
        id: "store",
        currencyCode: "NGN",
        countryCode: "NG",
      }),
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("?")
      expect(query).toContain('FROM "FinanceBook"')
      expect(values).toEqual(["tenant", "NGN"])
      trace.push("book-lock")
      return options.noBook ? [] : [{ id: "book" }]
    },
    $executeRaw: async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      expect(strings.join("?")).toContain("pg_advisory_xact_lock")
      expect(values).toEqual([
        JSON.stringify(["catalog-command", "tenant", "create"]),
      ])
      trace.push("command-lock")
      commandLocked = true
      return 1
    },
    catalogCommandReceipt: {
      findUnique: async () => {
        savedReads++
        trace.push("receipt-read")
        return receiptCreated || (commandLocked && replayAfterLock)
          ? f.receipt
          : null
      },
      findFirst: async () => {
        expect(receiptCreated).toBe(true)
        trace.push("source-proof")
        return f.receipt
      },
      create: async ({ data }: { data: object }) => {
        trace.push("receipt-create")
        Object.assign(f.receipt, data)
        receiptCreated = true
        return f.receipt
      },
    },
    sellableOffering: {
      findFirst: async ({ select }: { select?: unknown }) => {
        trace.push("offering-read")
        return select ? { catalogItemId: "catalog" } : { ...offering }
      },
      findMany: async () => [{ variantId: "variant" }],
      updateMany: async () => {
        trace.push("offering-write")
        offering.revision++
        return { count: 1 }
      },
    },
    serviceCommerceStoreProfile: {
      findFirst: async () => ({
        id: "profile",
        status: "ACTIVE",
        catalogAdoptionMode: "PROGRESSIVE",
      }),
    },
    catalogSourceLineLink: {
      findMany: async () => [{ sourceType: "COMMERCE_INQUIRY" }],
    },
    serviceCommercePolicyDecision: {
      findMany: async () => [
        {
          id: "policy",
          subject: "MANAGED_INVENTORY_GRADUATION",
          channel: "STAFF",
          vertical: "SERVICE",
          jurisdictionCode: "NG",
          outcome: "ALLOWED",
          revision: 1,
          approvalReference: "approval",
          evidenceReference: "evidence",
          effectiveAt: new Date("2026-08-01T00:00:00Z"),
          expiresAt: new Date("2027-08-01T00:00:00Z"),
          revokedAt: null,
        },
      ],
    },
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 1 }),
    },
    catalogAvailabilityAttestation: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 1 }),
    },
    catalogItem: { updateMany: async () => ({ count: 1 }) },
    sellableVariant: { updateMany: async () => ({ count: 1 }) },
    catalogProduct: {
      updateMany: async () => {
        offering.catalogItem.product.currentUnitConfigurationVersionId =
          "version"
        return { count: 1 }
      },
    },
    unitConfigurationVersion: { create: async () => version },
    inventoryUnit: {
      create: async () => f.unit,
      findMany: async ({ where, take }: { where: unknown; take: number }) => {
        expect(where).toEqual({
          configurationVersionId: "version",
          stockBehavior: "CANONICAL_SHARED",
        })
        expect(take).toBe(2)
        return canonicalUnits
      },
    },
    productUnitOffering: {
      create: async () => {
        const productUnit = {
          id: "product-unit",
          sku: "SKU",
          barcode: null,
          inventoryUnitId: "unit",
          inventoryUnit: { ...f.unit, configurationVersion: version },
        }
        offering.productUnitOffering = productUnit
        return productUnit
      },
      updateMany: async ({ data }: { data: object }) => {
        expect(data).not.toHaveProperty("inventoryUnitId")
        return { count: 1 }
      },
    },
    stockBalanceSource: {
      findFirst: async () => (balanceCreated ? f.balance : null),
      create: async ({ data }: { data: object }) => {
        trace.push("balance-create")
        Object.assign(f.balance, data)
        f.balance.onHandQuantity = new Prisma.Decimal(
          String(f.balance.onHandQuantity),
        )
        balanceCreated = true
        return f.balance
      },
    },
    stockOperation: {
      ...f.tx.stockOperation,
      create: async ({ data }: { data: object }) => {
        Object.assign(f.operation, data)
        trace.push("operation-create")
        return f.operation
      },
    },
    stockMovement: {
      ...f.tx.stockMovement,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(f.movement, data)
        for (const key of [
          "enteredQuantity",
          "previousOnHandQuantity",
          "resultingOnHandQuantity",
          "signedCanonicalEffect",
          "unitFactorSnapshot",
        ] as const)
          f.movement[key] = new Prisma.Decimal(String(data[key]))
        trace.push("movement-create")
        return f.movement
      },
    },
    storeOfferingAvailability: { upsert: async () => ({}) },
    serviceCommerceStoreAuditEvent: { create: async () => ({ id: "audit" }) },
  }
  const db = {
    $transaction: async <T>(
      run: (client: Prisma.TransactionClient) => Promise<T>,
      transactionOptions: unknown,
    ) => {
      expect(transactionOptions).toEqual({ maxWait: 10_000, timeout: 30_000 })
      return run(tx as unknown as Prisma.TransactionClient)
    },
  } as unknown as PrismaClient
  return {
    ...f,
    db,
    offering,
    configuredUnit,
    canonicalUnits,
    trace,
    savedReads: () => savedReads,
    prepareConcurrentReplay: async () => {
      await graduateServiceCommerceCatalogOffering(db, input)
      receiptCreated = false
      replayAfterLock = true
      commandLocked = false
      offering.revision = 99
      offering.status = "ACTIVE"
      f.balance.onHandQuantity = new Prisma.Decimal("17")
      f.balance.revision = 42
      f.book.closedThrough = new Date("2027-01-01T00:00:00Z")
      trace.length = 0
    },
  }
}

test("fresh graduation captures immutable UNKNOWN cost after source receipt under Book/command locks", async () => {
  const f = fixture()
  const before = new Date()
  const result = await graduateServiceCommerceCatalogOffering(f.db, input)
  expect(result).toMatchObject({ isGraduated: true, revision: 1 })
  expect(f.savedReads()).toBe(2)
  expect(f.trace.slice(0, 4)).toEqual([
    "receipt-read",
    "book-lock",
    "command-lock",
    "receipt-read",
  ])
  expect(f.trace.indexOf("source-proof")).toBeGreaterThan(
    f.trace.indexOf("receipt-create"),
  )
  expect(f.operation.effectiveAt.getTime()).toBeGreaterThanOrEqual(
    before.getTime(),
  )
  expect(f.events).toHaveLength(1)
  expect(f.events[0]).toMatchObject({
    sourceKind: "GRADUATION_OPENING",
    sourceId: "receipt",
    valueBeforeMinor: 0n,
    valueAfterMinor: null,
    sourceCostMinor: null,
    unknownReason: "MISSING_OPENING_COST",
    effectiveAt: f.operation.effectiveAt,
  })
})

test("a packaged or alternate selling unit retains its identity while opening uses the canonical count and scale", async () => {
  for (const behavior of ["PACKAGED_STOCK", "ALTERNATE_TRANSACTION"]) {
    const f = fixture({ configured: true })
    f.configuredUnit.stockBehavior = behavior
    await graduateServiceCommerceCatalogOffering(f.db, {
      ...input,
      openingStockQuantity: "0.5",
      transactionScale: 0,
    })
    expect(f.offering.productUnitOffering?.inventoryUnitId).toBe("case")
    expect(f.balance.inventoryUnitId).toBe("unit")
    expect(f.balance.onHandQuantity.toFixed()).toBe("0.5")
    expect(f.movement.enteredInventoryUnitId).toBe("unit")
    expect(f.movement.unitFactorSnapshot.toFixed()).toBe("1")
    expect(f.movement.transactionScaleSnapshot).toBe(3)
    expect(f.events[0]?.canonicalEffect?.toString()).toBe("0.5")
  }
})

test("an explicit zero graduation establishes known-zero history; no-Book graduation writes no cost", async () => {
  const zero = fixture()
  await graduateServiceCommerceCatalogOffering(zero.db, {
    ...input,
    openingStockQuantity: "0",
  })
  expect(zero.events[0]).toMatchObject({
    valueAfterMinor: 0n,
    sourceCostMinor: 0n,
    unknownReason: null,
  })
  expect(zero.pools[0]).toMatchObject({ valueMinor: 0n, lastMovementCount: 1n })
  const noBook = fixture({ noBook: true, configured: true })
  await graduateServiceCommerceCatalogOffering(noBook.db, input)
  expect(noBook.trace).toContain("receipt-create")
  expect(noBook.trace).not.toContain("source-proof")
  expect(noBook.bookReads()).toBe(0)
  expect(noBook.reads()).toBe(0)
  expect(noBook.writes()).toBe(0)
})

test("invalid canonical configurations reject before opening balance creation", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => f.canonicalUnits.splice(0),
    (f: ReturnType<typeof fixture>) => f.canonicalUnits.push(f.unit),
    (f: ReturnType<typeof fixture>) => {
      f.unit.factor = new Prisma.Decimal("12")
    },
    (f: ReturnType<typeof fixture>) => {
      f.configuredUnit.configurationVersion.status = "RETIRED"
    },
    (f: ReturnType<typeof fixture>) => {
      f.configuredUnit.configurationVersion.productId = "foreign-product"
    },
    (f: ReturnType<typeof fixture>) => {
      f.offering.catalogItem.product.currentUnitConfigurationVersionId =
        "old-version"
    },
  ]) {
    const f = fixture({ configured: true, noBook: true })
    mutate(f)
    await expect(
      graduateServiceCommerceCatalogOffering(f.db, input),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(f.trace).not.toContain("balance-create")
    expect(f.trace).not.toContain("receipt-create")
    expect(f.writes()).toBe(0)
  }
})

test("post-lock saved replay survives later publication, stock revisions and Book close without importing cost", async () => {
  for (const noBook of [false, true]) {
    const f = fixture({ noBook })
    await f.prepareConcurrentReplay()
    const writes = f.writes()
    const sourceReads = f.bookReads()
    await graduateServiceCommerceCatalogOffering(f.db, input)
    expect(f.trace.slice(0, 4)).toEqual([
      "receipt-read",
      "book-lock",
      "command-lock",
      "receipt-read",
    ])
    expect(f.trace).not.toContain("balance-create")
    expect(f.trace).not.toContain("offering-write")
    expect(f.trace).not.toContain("source-proof")
    expect(f.writes()).toBe(writes)
    expect(f.bookReads()).toBe(sourceReads)
  }
})

test("financial date rejection retains the typed graduation domain error", async () => {
  const f = fixture()
  f.book.closedThrough = new Date("2027-01-01T00:00:00Z")
  await expect(
    graduateServiceCommerceCatalogOffering(f.db, input),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.writes()).toBe(0)
})
