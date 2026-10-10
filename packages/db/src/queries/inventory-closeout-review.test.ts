import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import { getInventoryCloseoutReview } from "./inventory-closeout-review"

const scope = { tenantId: "tenant", storeId: "store", closeoutId: "closeout" }
const decimal = (value: string) => new Prisma.Decimal(value)
function fixture() {
  const source = {
    id: "balance",
    tenantId: "tenant",
    storeId: "store",
    custodyType: "STAFF",
    custodyReferenceId: "staff",
    productId: "product",
    variantId: "variant",
    inventoryUnitId: "unit",
    revision: 2,
    onHandQuantity: decimal("5"),
    reservedQuantity: decimal("0"),
    inventoryUnit: {
      id: "unit",
      name: "Piece",
      configurationVersionId: "version",
      factor: decimal("1"),
      transactionScale: 0,
      configurationVersion: { productId: "product" },
    },
    product: {
      id: "product",
      catalogItemId: "catalog",
      catalogItem: { tenantId: "tenant", name: "Eggs" },
    },
    variant: { id: "variant", catalogItemId: "catalog", name: "Standard" },
  }
  const row = {
    id: "closeout",
    tenantId: "tenant",
    storeId: "store",
    status: "DRAFT",
    custodyType: "STAFF",
    custodyReferenceId: "staff",
    reason: "End of shift",
    createdAt: new Date("2026-10-10T00:00:00Z"),
    finalizedAt: null,
    finalizedOperationId: null,
    lines: [
      {
        id: "line",
        closeoutId: "closeout",
        balanceSourceId: "balance",
        expectedRevision: 2,
        expectedQuantity: decimal("5"),
        declaredQuantity: decimal("4"),
        varianceQuantity: decimal("-1"),
        balanceSource: source,
      },
    ],
  }
  const db = {
    inventoryCloseout: {
      findFirst: async (query: unknown) => {
        expect(query).toMatchObject({
          where: { id: "closeout", tenantId: "tenant", storeId: "store" },
          include: { lines: { take: 501 } },
        })
        return row
      },
    },
  } as unknown as Prisma.TransactionClient
  const line = row.lines[0]
  if (!line) throw new Error("Fixture line missing")
  return { source, row, line, db }
}
test("closeout review retains original declarations and exact variance", async () => {
  const f = fixture()
  const result = await getInventoryCloseoutReview(f.db, scope)
  expect(result.canFinalize).toBe(true)
  expect(result.lines[0]).toMatchObject({
    expectedQuantity: "5",
    declaredQuantity: "4",
    varianceQuantity: "-1",
    stockCurrent: true,
  })
})
test("changed stock is visible without rebasing the original declaration", async () => {
  const f = fixture()
  f.source.revision = 3
  f.source.onHandQuantity = decimal("6")
  const result = await getInventoryCloseoutReview(f.db, scope)
  expect(result.canFinalize).toBe(false)
  expect(result.lines[0]).toMatchObject({
    expectedQuantity: "5",
    declaredQuantity: "4",
    currentQuantity: "6",
    varianceQuantity: "-1",
    stockCurrent: false,
  })
})
test("closeout cannot finalize below reservations; zero is a valid declaration", async () => {
  const f = fixture()
  f.source.reservedQuantity = decimal("4.5")
  expect((await getInventoryCloseoutReview(f.db, scope)).canFinalize).toBe(
    false,
  )
  f.source.reservedQuantity = decimal("0")
  f.line.declaredQuantity = decimal("0")
  f.line.varianceQuantity = decimal("-5")
  expect((await getInventoryCloseoutReview(f.db, scope)).canFinalize).toBe(true)
})
test("finalized and empty closeouts remain readable but cannot be finalized", async () => {
  const f = fixture()
  f.row.status = "FINALIZED"
  expect((await getInventoryCloseoutReview(f.db, scope)).canFinalize).toBe(
    false,
  )
  f.row.status = "DRAFT"
  f.row.lines = []
  expect((await getInventoryCloseoutReview(f.db, scope)).canFinalize).toBe(
    false,
  )
})
for (const change of [
  (f: ReturnType<typeof fixture>) => {
    f.source.storeId = "foreign"
  },
  (f: ReturnType<typeof fixture>) => {
    f.source.custodyReferenceId = "other-staff"
  },
  (f: ReturnType<typeof fixture>) => {
    f.source.product.catalogItem.tenantId = "foreign"
  },
  (f: ReturnType<typeof fixture>) => {
    f.line.varianceQuantity = decimal("0")
  },
  (f: ReturnType<typeof fixture>) => {
    f.row.lines.push({ ...f.line, id: "duplicate" })
  },
]) {
  test("closeout refuses inconsistent ownership or declaration evidence", async () => {
    const f = fixture()
    change(f)
    await expect(getInventoryCloseoutReview(f.db, scope)).rejects.toMatchObject(
      { code: "INVALID_STOCK_OPERATION" },
    )
  })
}

test("recent closeout list keeps Store/status scope, bounded size and exact history metadata", async () => {
  const { listInventoryCloseouts } = await import("./inventory-closeout-review")
  const db = {
    inventoryCloseout: {
      findMany: async (query: unknown) => {
        expect(query).toMatchObject({
          where: { tenantId: "tenant", storeId: "store", status: "DRAFT" },
          take: 50,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
        return [
          {
            id: "saved",
            status: "DRAFT",
            custodyType: "STAFF",
            custodyReferenceId: "staff",
            reason: "Shift end",
            createdAt: new Date("2026-10-10T00:00:00Z"),
            finalizedAt: null,
            _count: { lines: 2 },
          },
        ]
      },
    },
  } as unknown as Prisma.TransactionClient
  expect(
    await listInventoryCloseouts(db, {
      tenantId: "tenant",
      storeId: "store",
      status: "DRAFT",
      limit: 100,
    }),
  ).toEqual([
    {
      id: "saved",
      status: "DRAFT",
      custodyType: "STAFF",
      custodyReferenceId: "staff",
      reason: "Shift end",
      createdAt: "2026-10-10T00:00:00.000Z",
      finalizedAt: null,
      lineCount: 2,
    },
  ])
})

function creationFixture() {
  const f = fixture()
  const sources = [
    f.source,
    { ...f.source, id: "second", onHandQuantity: decimal("3") },
  ]
  const writes: unknown[] = []
  let reads = 0
  const db = {
    stockBalanceSource: {
      findMany: async (query: unknown) => {
        reads++
        expect(query).toMatchObject({
          where: {
            tenantId: "tenant",
            storeId: "store",
            custodyType: "STAFF",
            custodyReferenceId: "staff",
            id: { in: ["balance", "second"] },
          },
          take: 3,
        })
        return sources
      },
    },
    inventoryCloseout: {
      findUnique: async () => null,
      create: async ({ data }: { data: unknown }) => {
        writes.push(data)
        return { id: "new-closeout" }
      },
    },
    inventoryCloseoutLine: {
      createMany: async ({ data }: { data: unknown[] }) => {
        writes.push(data)
        return { count: data.length }
      },
    },
  } as unknown as Prisma.TransactionClient
  const input = {
    tenantId: "tenant",
    storeId: "store",
    actorUserId: "manager",
    clientOperationId: "create-closeout",
    schemaVersion: 1 as const,
    custodyType: "staff" as const,
    custodyReferenceId: "staff",
    reason: "End of shift",
    declarations: [
      {
        balanceSourceId: "balance",
        declaredQuantity: "0",
        expectedRevision: 2,
      },
      { balanceSourceId: "second", declaredQuantity: "2", expectedRevision: 2 },
    ],
  }
  return { db, input, sources, writes, reads: () => reads }
}
test("closeout creation batches exact declarations and leaves stock untouched", async () => {
  const { createInventoryCloseoutInTransaction } = await import(
    "./inventory-custody-transfers"
  )
  const f = creationFixture()
  expect((await createInventoryCloseoutInTransaction(f.db, f.input)).id).toBe(
    "new-closeout",
  )
  expect(f.reads()).toBe(1)
  expect(f.writes[1]).toEqual([
    {
      balanceSourceId: "balance",
      closeoutId: "new-closeout",
      declaredQuantity: "0",
      expectedQuantity: "5",
      expectedRevision: 2,
      varianceQuantity: "-5",
    },
    {
      balanceSourceId: "second",
      closeoutId: "new-closeout",
      declaredQuantity: "2",
      expectedQuantity: "3",
      expectedRevision: 2,
      varianceQuantity: "-1",
    },
  ])
})
test("stale closeout declarations fail before draft persistence", async () => {
  const { createInventoryCloseoutInTransaction } = await import(
    "./inventory-custody-transfers"
  )
  const f = creationFixture()
  const first = f.input.declarations[0]
  if (!first) throw Error("Fixture line missing")
  first.expectedRevision = 1
  await expect(
    createInventoryCloseoutInTransaction(f.db, f.input),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(f.writes).toHaveLength(0)
})
test("closeout preview refuses duplicates before querying and precision before saving", async () => {
  const { previewInventoryCloseoutCreation } = await import(
    "./inventory-closeout-review"
  )
  const f = creationFixture()
  await expect(
    previewInventoryCloseoutCreation(f.db, {
      ...f.input,
      declarations: [...f.input.declarations, ...f.input.declarations],
    }),
  ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
  expect(f.reads()).toBe(0)
  const first = f.input.declarations[0]
  if (!first) throw Error("Fixture line missing")
  first.declaredQuantity = "0.1"
  await expect(
    previewInventoryCloseoutCreation(f.db, f.input),
  ).rejects.toThrow()
  expect(f.writes).toHaveLength(0)
})
test("creation refuses custody changes and preserves reservation conflicts for review", async () => {
  const { previewInventoryCloseoutCreation } = await import(
    "./inventory-closeout-review"
  )
  const f = creationFixture()
  const first = f.sources[0]
  if (!first) throw Error("Fixture source missing")
  first.reservedQuantity = decimal("1")
  expect(
    (await previewInventoryCloseoutCreation(f.db, f.input))[0],
  ).toMatchObject({ declaredQuantity: "0", preservesReservations: false })
  first.custodyReferenceId = "other-staff"
  await expect(
    previewInventoryCloseoutCreation(f.db, f.input),
  ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
})
