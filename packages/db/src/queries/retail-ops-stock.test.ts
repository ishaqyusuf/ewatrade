import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../generated/prisma/client"
import {
  recordRetailOpsStockAdjustment,
  recordRetailOpsStockIntake,
  recordRetailOpsUnitConversion,
} from "./retail-ops-stock"

type StockCall = {
  data?: unknown
  kind: string
  where?: unknown
}

function createProductVariantRow(input?: {
  id?: string
  name?: string
  ratioDenominator?: number
  ratioNumerator?: number
}) {
  return {
    conversionRatioDenominator: input?.ratioDenominator ?? 1,
    conversionRatioNumerator: input?.ratioNumerator ?? 1,
    id: input?.id ?? "variant_bag",
    metadata: {},
    name: input?.name ?? "Bag",
    product: {
      id: "product_rice",
      name: "Rice",
    },
  }
}

function createMockStockIntakeDb() {
  const calls: StockCall[] = []
  const receivedAt = new Date("2026-07-12T09:00:00.000Z")
  const variant = createProductVariantRow()

  const tx = {
    inventoryItem: {
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findUnique", where })

        return {
          onHandQuantity: 5,
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
          onHandQuantity: 15,
        }
      },
    },
    inventoryMovement: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryMovement.findFirst", where })

        return null
      },
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "inventoryMovement.upsert",
          where,
        })

        return { id: "movement_intake" }
      },
    },
    productVariant: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productVariant.findFirst", where })

        return variant
      },
    },
    stockDelivery: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "stockDelivery.upsert",
          where,
        })

        return { id: "delivery_123" }
      },
    },
    stockDeliveryLine: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "stockDeliveryLine.create" })

        return { id: "delivery_line_123" }
      },
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "stockDeliveryLine.findFirst", where })

        return null
      },
    },
    store: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return { metadata: {} }
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "store.update", where })

        return { id: "store_123" }
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
    receivedAt,
  }
}

function createMockUnitConversionDb() {
  const calls: StockCall[] = []
  const convertedAt = new Date("2026-07-12T10:00:00.000Z")
  const sourceVariant = createProductVariantRow({
    id: "variant_bag",
    name: "Bag",
    ratioDenominator: 1,
    ratioNumerator: 1,
  })
  const targetVariant = createProductVariantRow({
    id: "variant_half_bag",
    name: "Half bag",
    ratioDenominator: 2,
    ratioNumerator: 1,
  })

  const tx = {
    inventoryItem: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        calls.push({ kind: "inventoryItem.findUnique", where })

        if (where.productVariantId === "variant_bag") {
          return {
            id: "inventory_bag",
            onHandQuantity: 8,
            reservedQuantity: 1,
          }
        }

        if (where.productVariantId === "variant_half_bag") {
          return {
            onHandQuantity: 4,
          }
        }

        return null
      },
      findUniqueOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findUniqueOrThrow", where })

        return {
          onHandQuantity: 7,
        }
      },
      updateMany: async ({
        data,
        where,
      }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "inventoryItem.updateMany", where })

        return { count: 1 }
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
          id: "inventory_half_bag",
          onHandQuantity: 6,
        }
      },
    },
    inventoryMovement: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryMovement.findMany", where })

        return []
      },
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "inventoryMovement.upsert",
          where,
        })

        return { id: "movement_conversion" }
      },
    },
    productVariant: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productVariant.findMany", where })

        return [sourceVariant, targetVariant]
      },
    },
    store: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return { metadata: {} }
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "store.update", where })

        return { id: "store_123" }
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
    convertedAt,
  }
}

function createMockStockAdjustmentDb(input?: { reservedQuantity?: number }) {
  const calls: StockCall[] = []
  const adjustedAt = new Date("2026-07-12T11:00:00.000Z")
  const variant = createProductVariantRow()

  const tx = {
    inventoryItem: {
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findUnique", where })

        return {
          id: "inventory_bag",
          onHandQuantity: 8,
          reservedQuantity: input?.reservedQuantity ?? 1,
        }
      },
      findUniqueOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findUniqueOrThrow", where })

        return {
          id: "inventory_bag",
          onHandQuantity: 6,
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
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryMovement.findFirst", where })

        return null
      },
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "inventoryMovement.upsert",
          where,
        })

        return { id: "movement_adjustment" }
      },
    },
    productVariant: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productVariant.findFirst", where })

        return variant
      },
    },
    store: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return { metadata: {} }
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "store.update", where })

        return { id: "store_123" }
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
  }

  return {
    adjustedAt,
    calls,
    client: db as unknown as PrismaClient,
  }
}

function getCalls(calls: StockCall[], kind: string) {
  return calls.filter((entry) => entry.kind === kind)
}

function getCall(calls: StockCall[], kind: string) {
  const call = calls.find((entry) => entry.kind === kind)
  if (!call) {
    throw new Error(`Expected ${kind} call`)
  }

  return call
}

describe("retail ops stock queries", () => {
  test("records stock intake with delivery and durable movement ledger", async () => {
    const db = createMockStockIntakeDb()

    const result = await recordRetailOpsStockIntake(db.client, {
      actorUserId: "user_owner",
      externalId: " stock_intake_123 ",
      note: "Received from supplier",
      productVariantId: "variant_bag",
      quantity: 10,
      receivedAt: db.receivedAt,
      sourceName: "Supplier delivery",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toEqual({
      intake: {
        externalId: "stock_intake_123",
        note: "Received from supplier",
        quantity: 10,
        receivedAt: db.receivedAt,
        sourceName: "Supplier delivery",
      },
      inventory: {
        onHandQuantity: 15,
        previousOnHandQuantity: 5,
        productVariantId: "variant_bag",
      },
      unit: {
        id: "variant_bag",
        name: "Bag",
        productId: "product_rice",
        productName: "Rice",
      },
    })

    const delivery = getCall(db.calls, "stockDelivery.upsert")
    expect(delivery.data).toMatchObject({
      create: {
        notes: "Received from supplier",
        receivedAt: db.receivedAt,
        receivedByUserId: "user_owner",
        referenceNumber: "stock_intake_123",
        source: "SUPPLIER",
        sourceName: "Supplier delivery",
        status: "RECEIVED",
      },
    })

    const movement = getCall(db.calls, "inventoryMovement.upsert")
    expect(movement.data).toMatchObject({
      create: {
        direction: "INBOUND",
        externalId: "stock_intake_123",
        inventoryItemId: "inventory_bag",
        movementGroupId: "stock_intake:stock_intake_123",
        onHandQuantity: 15,
        previousOnHandQuantity: 5,
        productId: "product_rice",
        productVariantId: "variant_bag",
        quantity: 10,
        source: "STOCK_DELIVERY",
        stockDeliveryId: "delivery_123",
        stockDeliveryLineId: "delivery_line_123",
        type: "STOCK_INTAKE",
      },
    })

    expect(getCall(db.calls, "store.update").data).toMatchObject({
      metadata: {
        retailOps: {
          stockOperations: [
            {
              externalId: "stock_intake_123",
              type: "stock_intake",
            },
          ],
        },
      },
    })
  })

  test("records unit conversion as paired outbound and inbound stock movements", async () => {
    const db = createMockUnitConversionDb()

    const result = await recordRetailOpsUnitConversion(db.client, {
      actorUserId: "user_owner",
      convertedAt: db.convertedAt,
      externalId: " unit_conversion_123 ",
      note: "Split one bag",
      sourceProductVariantId: "variant_bag",
      sourceQuantity: 1,
      storeId: "store_123",
      targetProductVariantId: "variant_half_bag",
      targetQuantity: 2,
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      conversion: {
        convertedAt: db.convertedAt,
        externalId: "unit_conversion_123",
        note: "Split one bag",
        sourceQuantity: 1,
        targetQuantity: 2,
      },
      product: {
        id: "product_rice",
        name: "Rice",
      },
      source: {
        onHandQuantity: 7,
        previousOnHandQuantity: 8,
        productVariantId: "variant_bag",
        unitName: "Bag",
      },
      target: {
        onHandQuantity: 6,
        previousOnHandQuantity: 4,
        productVariantId: "variant_half_bag",
        unitName: "Half bag",
      },
    })

    const sourceUpdate = getCall(db.calls, "inventoryItem.updateMany")
    expect(sourceUpdate.where).toMatchObject({
      id: "inventory_bag",
      onHandQuantity: {
        gte: 2,
      },
      reservedQuantity: 1,
    })

    const movements = getCalls(db.calls, "inventoryMovement.upsert")
    expect(movements).toHaveLength(2)
    expect(movements.map((call) => call.data)).toContainEqual(
      expect.objectContaining({
        create: expect.objectContaining({
          direction: "OUTBOUND",
          movementGroupId: "unit_conversion:unit_conversion_123",
          onHandQuantity: 7,
          previousOnHandQuantity: 8,
          productVariantId: "variant_bag",
          quantity: 1,
          relatedProductVariantId: "variant_half_bag",
          source: "UNIT_CONVERSION",
          type: "CONVERSION_OUT",
        }),
      }),
    )
    expect(movements.map((call) => call.data)).toContainEqual(
      expect.objectContaining({
        create: expect.objectContaining({
          direction: "INBOUND",
          movementGroupId: "unit_conversion:unit_conversion_123",
          onHandQuantity: 6,
          previousOnHandQuantity: 4,
          productVariantId: "variant_half_bag",
          quantity: 2,
          relatedProductVariantId: "variant_bag",
          source: "UNIT_CONVERSION",
          type: "CONVERSION_IN",
        }),
      }),
    )

    expect(getCall(db.calls, "store.update").data).toMatchObject({
      metadata: {
        retailOps: {
          stockOperations: [
            {
              externalId: "unit_conversion_123",
              type: "unit_conversion",
            },
          ],
        },
      },
    })
  })

  test("records damage adjustment without consuming reserved stock", async () => {
    const db = createMockStockAdjustmentDb()

    const result = await recordRetailOpsStockAdjustment(db.client, {
      actorUserId: "user_owner",
      adjustedAt: db.adjustedAt,
      direction: "decrease",
      externalId: " stock_adjustment_123 ",
      note: "Damaged during handling",
      productVariantId: "variant_bag",
      quantity: 2,
      reason: "damage",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      adjustment: {
        adjustedAt: db.adjustedAt,
        direction: "decrease",
        externalId: "stock_adjustment_123",
        note: "Damaged during handling",
        quantity: 2,
        reason: "damage",
        sourceName: "Damage",
      },
      inventory: {
        onHandQuantity: 6,
        previousOnHandQuantity: 8,
        productVariantId: "variant_bag",
      },
      unit: {
        id: "variant_bag",
        name: "Bag",
        productId: "product_rice",
        productName: "Rice",
      },
    })

    const stockUpdate = getCall(db.calls, "inventoryItem.updateMany")
    expect(stockUpdate.where).toMatchObject({
      id: "inventory_bag",
      onHandQuantity: {
        gte: 3,
      },
      reservedQuantity: 1,
    })

    const movement = getCall(db.calls, "inventoryMovement.upsert")
    expect(movement.data).toMatchObject({
      create: {
        direction: "OUTBOUND",
        externalId: "stock_adjustment_123",
        movementGroupId: "stock_adjustment:stock_adjustment_123",
        onHandQuantity: 6,
        previousOnHandQuantity: 8,
        productVariantId: "variant_bag",
        quantity: 2,
        source: "STOCK_ADJUSTMENT",
        type: "DAMAGE",
      },
    })
  })

  test("rejects invalid adjustment reason and direction before stock mutation", async () => {
    const db = createMockStockAdjustmentDb()

    await expect(
      recordRetailOpsStockAdjustment(db.client, {
        actorUserId: "user_owner",
        direction: "increase",
        productVariantId: "variant_bag",
        quantity: 2,
        reason: "damage",
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toThrow("Damage and loss adjustments must decrease stock.")

    expect(db.calls).toHaveLength(0)
  })
})
