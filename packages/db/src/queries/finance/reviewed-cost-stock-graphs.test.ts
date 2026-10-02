import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { readReviewedCostStockGraphs as readGraphs } from "./reviewed-cost-stock-graphs"

function fixture(count = 1) {
  const calls: string[] = []
  const owners = Array.from({ length: count }, (_, i) => ({
    id: `operation-${i}`,
    storeId: "store",
    committedReservation: null,
    _count: {
      movements: 1,
      purchaseReceipts: 0,
      productFulfillments: 0,
      productReturns: 0,
      finalizedCounts: 0,
      finalizedCloseouts: 0,
      dispatchedTransfers: 0,
      receivedTransfers: 0,
      cancelledTransfers: 0,
      corrections: 0,
    },
  }))
  const movements = owners.map((op, i) => ({
    id: `movement-${i}`,
    operationId: op.id,
    balanceSourceId: "balance",
    enteredInventoryUnitId: "entered",
    purchaseReceipt: null,
    signedCanonicalEffect: new Prisma.Decimal("0.123456789012345678"),
    valuationEvent: {
      id: `event-${i}`,
      poolId: "pool",
      sourceCostMinor: i === 0 ? null : 9007199254740993n,
    },
  }))
  const datasets: Record<string, unknown[]> = {
    stockMovement: movements,
    stockBalanceSource: [
      {
        id: "balance",
        storeId: "store",
        inventoryUnitId: "canonical",
        productId: "product",
        variantId: "variant",
        parentBalanceSourceId: null,
      },
    ],
    stockTransfer: [],
    inventoryUnit: [
      {
        id: "canonical",
        configurationVersionId: "version",
        factor: new Prisma.Decimal("1"),
      },
      {
        id: "entered",
        configurationVersionId: "version",
        factor: new Prisma.Decimal("12"),
      },
    ],
    unitConfigurationVersion: [{ id: "version", productId: "product" }],
    store: [{ id: "store", tenantId: "tenant", currencyCode: "NGN" }],
    catalogProduct: [
      {
        id: "product",
        catalogItemId: "catalog",
        catalogItem: { id: "catalog", tenantId: "tenant" },
      },
    ],
    sellableVariant: [{ id: "variant", catalogItemId: "catalog" }],
    financeInventoryPool: [{ id: "pool" }],
  }
  let requestedUnits: string[] = []
  const tx = Object.fromEntries(
    Object.keys(datasets).map((name) => [
      name,
      {
        findMany: async (args: { where?: { id?: { in?: string[] } } }) => {
          calls.push(name)
          if (name === "inventoryUnit")
            requestedUnits = args.where?.id?.in ?? []
          return datasets[name]
        },
      },
    ]),
  ) as unknown as Prisma.TransactionClient
  const input = {
    owners: owners as unknown as Parameters<typeof readGraphs>[1]["owners"],
    balanceSourceIds: ["balance"],
    transferIds: [],
  }
  return {
    tx,
    input,
    calls,
    datasets,
    owners,
    movements,
    requestedUnits: () => requestedUnits,
  }
}

test("flat source graph preserves distinct entered/canonical units, NULL and exact values", async () => {
  const f = fixture(2)
  const result = await readGraphs(f.tx, f.input)
  const first = result[0]?.movements[0]
  const second = result[1]?.movements[0]
  expect(f.requestedUnits().sort()).toEqual(["canonical", "entered"])
  expect(first?.enteredInventoryUnit.id).toBe("entered")
  expect(first?.balanceSource.inventoryUnit.id).toBe("canonical")
  expect(first?.enteredInventoryUnit.factor.toFixed()).toBe("12")
  expect(first?.signedCanonicalEffect.toFixed()).toBe("0.123456789012345678")
  expect(first?.valuationEvent?.sourceCostMinor).toBeNull()
  expect(second?.valuationEvent?.sourceCostMinor).toBe(9007199254740993n)
})
test("4,096 original operations use the same eight flat reads and retain every movement", async () => {
  const f = fixture(4096)
  const result = await readGraphs(f.tx, f.input)
  expect(result).toHaveLength(4096)
  expect(
    new Set(result.flatMap((op) => op.movements.map((m) => m.id))).size,
  ).toBe(4096)
  expect(f.calls).toHaveLength(8)
  expect(new Set(f.calls).size).toBe(8)
})
for (const delegate of [
  "stockBalanceSource",
  "inventoryUnit",
  "unitConfigurationVersion",
  "store",
  "catalogProduct",
  "sellableVariant",
  "financeInventoryPool",
]) {
  test(`refuses incomplete ${delegate} identity coverage`, async () => {
    const f = fixture()
    f.datasets[delegate] = []
    await expect(readGraphs(f.tx, f.input)).rejects.toThrow("scope changed")
  })
}
test("refuses missing movements", async () => {
  const f = fixture()
  f.datasets.stockMovement = []
  await expect(readGraphs(f.tx, f.input)).rejects.toThrow(
    "movement set is incomplete",
  )
})
test("refuses unchanged total with movement ownership moved to another operation", async () => {
  const f = fixture(2)
  for (const movement of f.movements) movement.operationId = "operation-0"
  await expect(readGraphs(f.tx, f.input)).rejects.toThrow(
    "operation movement coverage changed",
  )
})
test("refuses duplicate metadata rows that replace an actual identity", async () => {
  const f = fixture()
  f.datasets.inventoryUnit = [{ id: "canonical" }, { id: "canonical" }]
  await expect(readGraphs(f.tx, f.input)).rejects.toThrow("unit scope changed")
})
test("refuses duplicate owning identities before any read", async () => {
  const f = fixture(2)
  for (const owner of f.owners) owner.id = "same"
  await expect(readGraphs(f.tx, f.input)).rejects.toThrow(
    "exceeds connected bounds",
  )
  expect(f.calls).toHaveLength(0)
})
test("refuses the movement overflow sentinel before any read", async () => {
  const f = fixture()
  for (const owner of f.owners) owner._count.movements = 4097
  await expect(readGraphs(f.tx, f.input)).rejects.toThrow(
    "exceeds connected bounds",
  )
  expect(f.calls).toHaveLength(0)
})
