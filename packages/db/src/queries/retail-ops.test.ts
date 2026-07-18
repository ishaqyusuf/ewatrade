import { describe, expect, test } from "bun:test"
import {
  getRetailOpsDashboardSummary,
  getRetailOpsInventorySnapshot,
  getRetailOpsSalesByProduct,
} from "./retail-ops"
import type { DbClient } from "./types"

type RetailOpsCall = {
  kind: string
  where?: unknown
}

function createMockRetailOpsDb() {
  const calls: RetailOpsCall[] = []
  const products = [
    {
      id: "product_rice",
      listPriceMinor: 18_500,
      name: "Rice",
      variants: [
        {
          id: "variant_bag",
          inventoryItem: {
            onHandQuantity: 8,
            reservedQuantity: 1,
          },
          isDefault: true,
          name: "Bag",
          priceMinor: 18_500,
        },
        {
          id: "variant_half_bag",
          inventoryItem: {
            onHandQuantity: 3,
            reservedQuantity: 0,
          },
          isDefault: false,
          name: "Half bag",
          priceMinor: 9_500,
        },
      ],
    },
    {
      id: "product_beans",
      listPriceMinor: 12_000,
      name: "Beans",
      variants: [],
    },
  ]
  const from = new Date("2026-07-12T00:00:00.000Z")
  const to = new Date("2026-07-12T23:59:59.000Z")

  const db = {
    cashierSession: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "cashierSession.count", where })

        return 2
      },
    },
    order: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findMany", where })

        return [
          {
            id: "order_completed",
            status: "COMPLETED",
            totalMinor: 37_000,
          },
          {
            id: "order_pending",
            status: "PENDING",
            totalMinor: 9_500,
          },
        ]
      },
    },
    orderItem: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "orderItem.findMany", where })

        return [
          {
            nameSnapshot: "Rice",
            productId: "product_rice",
            productVariant: {
              name: "Bag",
            },
            quantity: 2,
            totalPriceMinor: 37_000,
          },
          {
            nameSnapshot: "Rice",
            productId: "product_rice",
            productVariant: {
              name: "Half bag",
            },
            quantity: 1,
            totalPriceMinor: 9_500,
          },
          {
            nameSnapshot: "Rice",
            productId: "product_rice",
            productVariant: {
              name: "Bag",
            },
            quantity: 1,
            totalPriceMinor: 18_500,
          },
        ]
      },
    },
    product: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.findMany", where })

        return products
      },
    },
    receipt: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "receipt.findMany", where })

        return [
          {
            id: "receipt_cash",
            paymentMethod: "cash",
            totalMinor: 37_000,
          },
          {
            id: "receipt_transfer",
            paymentMethod: "bank_transfer",
            totalMinor: 9_500,
          },
          {
            id: "receipt_card",
            paymentMethod: "card",
            totalMinor: 5_000,
          },
        ]
      },
    },
    store: {
      findFirstOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirstOrThrow", where })

        return {
          currencyCode: "NGN",
          id: "store_123",
          name: "Rice Store",
          slug: "rice-store",
        }
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
    from,
    to,
  }
}

function getCall(calls: RetailOpsCall[], kind: string) {
  const call = calls.find((entry) => entry.kind === kind)
  if (!call) {
    throw new Error(`Expected ${kind} call`)
  }

  return call
}

describe("retail ops dashboard report queries", () => {
  test("returns inventory snapshot units with fallback unit rows for products without variants", async () => {
    const db = createMockRetailOpsDb()

    const inventory = await getRetailOpsInventorySnapshot(db.client, {
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(inventory).toEqual([
      {
        isDefault: true,
        onHandQuantity: 8,
        priceMinor: 18_500,
        productId: "product_rice",
        productName: "Rice",
        reservedQuantity: 1,
        unitId: "variant_bag",
        unitName: "Bag",
      },
      {
        isDefault: false,
        onHandQuantity: 3,
        priceMinor: 9_500,
        productId: "product_rice",
        productName: "Rice",
        reservedQuantity: 0,
        unitId: "variant_half_bag",
        unitName: "Half bag",
      },
      {
        isDefault: true,
        onHandQuantity: 0,
        priceMinor: 12_000,
        productId: "product_beans",
        productName: "Beans",
        reservedQuantity: 0,
        unitId: "product_beans",
        unitName: "Unit",
      },
    ])
    expect(getCall(db.calls, "product.findMany").where).toMatchObject({
      kind: "PRODUCT",
      status: { not: "ARCHIVED" },
      storeId: "store_123",
      tenantId: "tenant_123",
    })
  })

  test("groups sales by product and unit with optional actor scope", async () => {
    const db = createMockRetailOpsDb()

    const rows = await getRetailOpsSalesByProduct(db.client, {
      actorUserId: "user_rep",
      from: db.from,
      storeId: "store_123",
      tenantId: "tenant_123",
      to: db.to,
    })

    expect(rows).toEqual([
      {
        grossMinor: 55_500,
        productId: "product_rice",
        productName: "Rice",
        quantity: 3,
        unitName: "Bag",
      },
      {
        grossMinor: 9_500,
        productId: "product_rice",
        productName: "Rice",
        quantity: 1,
        unitName: "Half bag",
      },
    ])
    expect(getCall(db.calls, "orderItem.findMany").where).toMatchObject({
      order: {
        AND: [
          {
            metadata: {
              equals: "retail_ops_sale",
              path: ["retailOps", "source"],
            },
          },
          {
            metadata: {
              equals: "user_rep",
              path: ["retailOps", "actorUserId"],
            },
          },
        ],
        status: { not: "CANCELLED" },
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
  })

  test("builds dashboard summary from production orders, receipts, inventory, and sessions", async () => {
    const db = createMockRetailOpsDb()

    const summary = await getRetailOpsDashboardSummary(db.client, {
      from: db.from,
      storeId: "store_123",
      tenantId: "tenant_123",
      to: db.to,
    })

    expect(summary).toEqual({
      inventory: {
        lowStockCount: 2,
        productCount: 2,
        stockUnitCount: 3,
      },
      payments: {
        cashMinor: 37_000,
        grossMinor: 51_500,
        receiptCount: 3,
        transferMinor: 9_500,
      },
      period: {
        from: db.from,
        to: db.to,
      },
      sales: {
        completedOrderCount: 1,
        orderCount: 2,
        pendingOrderCount: 1,
        totalMinor: 46_500,
      },
      sessions: {
        openCount: 2,
      },
      store: {
        currencyCode: "NGN",
        id: "store_123",
        name: "Rice Store",
        slug: "rice-store",
      },
    })

    expect(getCall(db.calls, "receipt.findMany").where).toMatchObject({
      issuedAt: {
        gte: db.from,
        lte: db.to,
      },
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    expect(getCall(db.calls, "cashierSession.count").where).toMatchObject({
      status: "OPEN",
      storeId: "store_123",
      tenantId: "tenant_123",
    })
  })
})
