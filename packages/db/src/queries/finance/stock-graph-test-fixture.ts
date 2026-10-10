import { Prisma } from "../../../generated/prisma/client"
import { readReviewedCostStockGraphs as readGraphs } from "./reviewed-cost-stock-graphs"

export function stockGraphFixture(count = 1) {
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
