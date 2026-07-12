import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../generated/prisma/client"
import {
  assignRetailOpsStaffStock,
  listRetailOpsStaffStockWallets,
  returnRetailOpsStaffStock,
} from "./retail-ops-stock-wallets"

type StockWalletCall = {
  data?: unknown
  kind: string
  where?: unknown
}

function createWalletBalance(overrides: Record<string, unknown> = {}) {
  return {
    product: {
      id: "product_rice",
      name: "Rice",
    },
    quantity: 4,
    staff: {
      displayName: "Cashier Ada",
      email: "ada@example.com",
      id: "user_cashier",
    },
    unit: {
      id: "variant_bag",
      name: "Bag",
      sku: "rice-bag",
    },
    updatedAt: "2026-07-12T08:00:00.000Z",
    ...overrides,
  }
}

function createStoreMetadata() {
  return {
    retailOps: {
      staffStockWallets: [createWalletBalance()],
    },
  }
}

function createStaffMembership() {
  return {
    role: "CASHIER",
    status: "ACTIVE",
    user: {
      displayName: "Cashier Ada",
      email: "ada@example.com",
      id: "user_cashier",
      name: "Ada",
    },
  }
}

function createProductVariant() {
  return {
    id: "variant_bag",
    name: "Bag",
    sku: "rice-bag",
    product: {
      id: "product_rice",
      name: "Rice",
    },
  }
}

function createMockListStaffStockWalletDb() {
  const calls: StockWalletCall[] = []
  const db = {
    staffStockWallet: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "staffStockWallet.findMany", where })

        return [
          {
            lastMovementAt: new Date("2026-07-12T09:00:00.000Z"),
            onHandQuantity: 8,
            product: {
              id: "product_beans",
              name: "Beans",
            },
            productVariant: {
              id: "variant_cup",
              name: "Cup",
              sku: "beans-cup",
            },
            staffUser: {
              displayName: null,
              email: "bisi@example.com",
              id: "user_bisi",
              name: "Bisi",
            },
            updatedAt: new Date("2026-07-12T08:30:00.000Z"),
          },
        ]
      },
    },
    store: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return {
          metadata: createStoreMetadata(),
        }
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function createMockAssignStaffStockDb() {
  const calls: StockWalletCall[] = []
  const assignedAt = new Date("2026-07-12T10:00:00.000Z")
  const store = {
    id: "store_123",
    metadata: createStoreMetadata(),
  }
  const tx = {
    inventoryItem: {
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findUnique", where })

        return {
          id: "inventory_bag",
          onHandQuantity: 20,
          reservedQuantity: 2,
        }
      },
      findUniqueOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findUniqueOrThrow", where })

        return {
          onHandQuantity: 14,
        }
      },
      updateMany: async ({
        data,
        where,
      }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "inventoryItem.updateMany", where })

        return { count: 1 }
      },
    },
    inventoryMovement: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "inventoryMovement.upsert",
          where,
        })

        return { id: "movement_assignment" }
      },
    },
    membership: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "membership.findFirst", where })

        return createStaffMembership()
      },
    },
    productVariant: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productVariant.findFirst", where })

        return createProductVariant()
      },
    },
    staffStockWallet: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "staffStockWallet.upsert",
          where,
        })

        return { id: "staff_wallet_123" }
      },
    },
    store: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return store
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "store.update", where })

        return { id: store.id }
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
  }

  return {
    assignedAt,
    calls,
    client: db as unknown as PrismaClient,
  }
}

function createMockReturnStaffStockDb() {
  const calls: StockWalletCall[] = []
  const returnedAt = new Date("2026-07-12T11:00:00.000Z")
  const store = {
    id: "store_123",
    metadata: createStoreMetadata(),
  }
  const tx = {
    inventoryItem: {
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findUnique", where })

        return {
          id: "inventory_bag",
          onHandQuantity: 14,
        }
      },
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "inventoryItem.upsert",
          where,
        })

        return {
          id: "inventory_bag",
          onHandQuantity: 16,
        }
      },
    },
    inventoryMovement: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "inventoryMovement.upsert",
          where,
        })

        return { id: "movement_return" }
      },
    },
    membership: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "membership.findFirst", where })

        return {
          role: "CASHIER",
          status: "ACTIVE",
        }
      },
    },
    productVariant: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productVariant.findFirst", where })

        return {
          id: "variant_bag",
        }
      },
    },
    staffStockWallet: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "staffStockWallet.upsert",
          where,
        })

        return { id: "staff_wallet_123" }
      },
    },
    store: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return store
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "store.update", where })

        return { id: store.id }
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
    returnedAt,
  }
}

function getCall(calls: StockWalletCall[], kind: string) {
  const call = calls.find((entry) => entry.kind === kind)
  expect(call).toBeDefined()
  if (!call) {
    throw new Error(`Expected ${kind} call`)
  }

  return call
}

describe("retail ops staff stock wallet queries", () => {
  test("lists durable staff stock wallets merged with store metadata fallback balances", async () => {
    const db = createMockListStaffStockWalletDb()

    const result = await listRetailOpsStaffStockWallets(db.client, {
      limit: 10,
      staffUserId: "user_cashier",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toEqual([
      {
        product: {
          id: "product_beans",
          name: "Beans",
        },
        quantity: 8,
        staff: {
          displayName: "Bisi",
          email: "bisi@example.com",
          id: "user_bisi",
        },
        unit: {
          id: "variant_cup",
          name: "Cup",
          sku: "beans-cup",
        },
        updatedAt: new Date("2026-07-12T09:00:00.000Z"),
      },
      {
        product: {
          id: "product_rice",
          name: "Rice",
        },
        quantity: 4,
        staff: {
          displayName: "Cashier Ada",
          email: "ada@example.com",
          id: "user_cashier",
        },
        unit: {
          id: "variant_bag",
          name: "Bag",
          sku: "rice-bag",
        },
        updatedAt: new Date("2026-07-12T08:00:00.000Z"),
      },
    ])
    expect(getCall(db.calls, "staffStockWallet.findMany")).toMatchObject({
      where: {
        onHandQuantity: {
          gt: 0,
        },
        staffUserId: "user_cashier",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "store.findFirst")).toMatchObject({
      where: {
        id: "store_123",
        status: {
          not: "ARCHIVED",
        },
        tenantId: "tenant_123",
      },
    })
  })

  test("assigns store stock to a staff wallet with reserved-stock protection and durable movement", async () => {
    const db = createMockAssignStaffStockDb()

    const result = await assignRetailOpsStaffStock(db.client, {
      actorUserId: "user_owner",
      assignedAt: db.assignedAt,
      externalId: " assign_staff_stock_123 ",
      note: "Morning allocation",
      productVariantId: "variant_bag",
      quantity: 6,
      staffUserId: "user_cashier",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      assignment: {
        actorUserId: "user_owner",
        assignedAt: db.assignedAt,
        externalId: "assign_staff_stock_123",
        note: "Morning allocation",
        quantity: 6,
      },
      inventory: {
        onHandQuantity: 14,
        previousOnHandQuantity: 20,
        productVariantId: "variant_bag",
      },
      wallet: {
        previousQuantity: 4,
        quantity: 10,
        staff: {
          id: "user_cashier",
        },
        unit: {
          id: "variant_bag",
        },
      },
    })
    expect(getCall(db.calls, "inventoryItem.updateMany")).toMatchObject({
      data: {
        onHandQuantity: {
          decrement: 6,
        },
        updatedByUserId: "user_owner",
      },
      where: {
        id: "inventory_bag",
        onHandQuantity: {
          gte: 8,
        },
        reservedQuantity: 2,
      },
    })
    expect(getCall(db.calls, "store.update")).toMatchObject({
      data: {
        metadata: {
          retailOps: {
            staffStockAssignments: [
              {
                actorUserId: "user_owner",
                assignedAt: "2026-07-12T10:00:00.000Z",
                externalId: "assign_staff_stock_123",
                quantity: 6,
                wallet: {
                  previousQuantity: 4,
                  quantity: 10,
                },
              },
            ],
            staffStockWallets: [
              {
                quantity: 10,
                staff: {
                  id: "user_cashier",
                },
                unit: {
                  id: "variant_bag",
                },
                updatedAt: "2026-07-12T10:00:00.000Z",
              },
            ],
          },
        },
      },
      where: {
        id: "store_123",
      },
    })
    expect(getCall(db.calls, "staffStockWallet.upsert")).toMatchObject({
      data: {
        create: {
          lastMovementAt: db.assignedAt,
          onHandQuantity: 10,
          productId: "product_rice",
          productVariantId: "variant_bag",
          staffUserId: "user_cashier",
          storeId: "store_123",
          tenantId: "tenant_123",
          updatedByUserId: "user_owner",
        },
      },
    })
    expect(getCall(db.calls, "inventoryMovement.upsert")).toMatchObject({
      data: {
        create: {
          actorUserId: "user_owner",
          direction: "OUTBOUND",
          externalId: "assign_staff_stock_123",
          inventoryItemId: "inventory_bag",
          movementGroupId: "staff_assignment:assign_staff_stock_123",
          note: "Morning allocation",
          onHandQuantity: 14,
          previousOnHandQuantity: 20,
          previousStaffWalletQuantity: 4,
          productId: "product_rice",
          productVariantId: "variant_bag",
          quantity: 6,
          source: "STAFF_STOCK_ASSIGNMENT",
          staffUserId: "user_cashier",
          staffWalletQuantity: 10,
          storeId: "store_123",
          tenantId: "tenant_123",
          type: "STAFF_ASSIGNMENT",
        },
      },
      where: {
        tenantId_storeId_type_externalId: {
          externalId: "assign_staff_stock_123",
          storeId: "store_123",
          tenantId: "tenant_123",
          type: "STAFF_ASSIGNMENT",
        },
      },
    })
  })

  test("returns staff wallet stock to store inventory and removes empty fallback balances", async () => {
    const db = createMockReturnStaffStockDb()

    const result = await returnRetailOpsStaffStock(db.client, {
      actorUserId: "user_owner",
      externalId: " return_staff_stock_123 ",
      note: "End of shift return",
      productVariantId: "variant_bag",
      quantity: 4,
      returnedAt: db.returnedAt,
      staffUserId: "user_cashier",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      inventory: {
        onHandQuantity: 16,
        previousOnHandQuantity: 14,
        productVariantId: "variant_bag",
      },
      stockReturn: {
        actorUserId: "user_owner",
        externalId: "return_staff_stock_123",
        note: "End of shift return",
        quantity: 4,
        returnedAt: db.returnedAt,
      },
      wallet: {
        previousQuantity: 4,
        quantity: 0,
        staff: {
          id: "user_cashier",
        },
        unit: {
          id: "variant_bag",
        },
      },
    })
    expect(getCall(db.calls, "inventoryItem.upsert")).toMatchObject({
      data: {
        create: {
          onHandQuantity: 4,
          productVariantId: "variant_bag",
          storeId: "store_123",
          tenantId: "tenant_123",
          updatedByUserId: "user_owner",
        },
        update: {
          onHandQuantity: {
            increment: 4,
          },
          updatedByUserId: "user_owner",
        },
      },
      where: {
        productVariantId: "variant_bag",
      },
    })
    expect(getCall(db.calls, "store.update")).toMatchObject({
      data: {
        metadata: {
          retailOps: {
            staffStockReturns: [
              {
                actorUserId: "user_owner",
                externalId: "return_staff_stock_123",
                quantity: 4,
                returnedAt: "2026-07-12T11:00:00.000Z",
                wallet: {
                  previousQuantity: 4,
                  quantity: 0,
                },
              },
            ],
            staffStockWallets: [],
          },
        },
      },
      where: {
        id: "store_123",
      },
    })
    expect(getCall(db.calls, "staffStockWallet.upsert")).toMatchObject({
      data: {
        create: {
          lastMovementAt: db.returnedAt,
          onHandQuantity: 0,
          productId: "product_rice",
          productVariantId: "variant_bag",
          staffUserId: "user_cashier",
          storeId: "store_123",
          tenantId: "tenant_123",
          updatedByUserId: "user_owner",
        },
      },
    })
    expect(getCall(db.calls, "inventoryMovement.upsert")).toMatchObject({
      data: {
        create: {
          actorUserId: "user_owner",
          direction: "INBOUND",
          externalId: "return_staff_stock_123",
          inventoryItemId: "inventory_bag",
          movementGroupId: "staff_return:return_staff_stock_123",
          note: "End of shift return",
          onHandQuantity: 16,
          previousOnHandQuantity: 14,
          previousStaffWalletQuantity: 4,
          productId: "product_rice",
          productVariantId: "variant_bag",
          quantity: 4,
          source: "STAFF_STOCK_RETURN",
          staffUserId: "user_cashier",
          staffWalletQuantity: 0,
          storeId: "store_123",
          tenantId: "tenant_123",
          type: "STAFF_RETURN",
        },
      },
      where: {
        tenantId_storeId_type_externalId: {
          externalId: "return_staff_stock_123",
          storeId: "store_123",
          tenantId: "tenant_123",
          type: "STAFF_RETURN",
        },
      },
    })
  })
})
