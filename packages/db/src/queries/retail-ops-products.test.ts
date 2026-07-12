import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../generated/prisma/client"
import {
  createRetailOpsProduct,
  listRetailOpsProductUnitPriceHistory,
  listRetailOpsProductUnitTemplates,
} from "./retail-ops-products"

type ProductCall = {
  data?: unknown
  kind: string
  where?: unknown
}

function createMockProductSetupDb() {
  const calls: ProductCall[] = []
  const createdVariants: Array<{
    id: string
    isActive: boolean
    isDefault: boolean
    metadata: unknown
    name: string
    priceMinor: number
    sku: string
  }> = []
  const product = {
    currencyCode: "NGN",
    id: "product_123",
    name: "Rice",
    slug: "rice",
  }

  const tx = {
    inventoryItem: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data, kind: "inventoryItem.create" })

        return {
          id: `inventory_${String(data.productVariantId)}`,
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

        return { id: "movement_123" }
      },
    },
    membership: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "membership.count", where })

        return 0
      },
    },
    offlineDevice: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDevice.findMany", where })

        return []
      },
    },
    offlineDeviceRevocation: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDeviceRevocation.findMany", where })

        return []
      },
    },
    product: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.count", where })

        return 0
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data, kind: "product.create" })

        return product
      },
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.findFirst", where })

        return null
      },
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.findUnique", where })

        return null
      },
    },
    productUnitTemplate: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productUnitTemplate.findFirst", where })

        return null
      },
    },
    productVariant: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const index = createdVariants.length
        const variant = {
          id: `variant_${index + 1}`,
          isActive: true,
          isDefault: data.isDefault === true,
          metadata: data.metadata,
          name: String(data.name),
          priceMinor: Number(data.priceMinor),
          sku: String(data.sku),
        }
        calls.push({ data, kind: "productVariant.create" })
        createdVariants.push(variant)

        return {
          id: variant.id,
          isDefault: variant.isDefault,
          name: variant.name,
          priceMinor: variant.priceMinor,
          sku: variant.sku,
        }
      },
    },
    store: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.count", where })

        return 1
      },
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return {
          currencyCode: "NGN",
        }
      },
    },
    subscriptionPlan: {
      findMany: async () => [],
    },
    tenant: {
      findFirstOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "tenant.findFirstOrThrow", where })

        return {
          createdAt: new Date("2026-07-01T08:00:00.000Z"),
          id: "tenant_123",
          metadata: {},
          name: "Rice Store",
          slug: "rice-store",
          updatedAt: new Date("2026-07-12T08:00:00.000Z"),
        }
      },
    },
    tenantSubscription: {
      findUnique: async () => null,
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
    product: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.findFirst.afterCreate", where })

        return {
          currencyCode: "NGN",
          id: product.id,
          variants: createdVariants,
        }
      },
    },
    productUnitPriceHistory: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "productUnitPriceHistory.upsert",
          where,
        })

        return { id: "price_history_123" }
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function createMockProductReadsDb() {
  const calls: ProductCall[] = []
  const variantMetadata = {
    retailOps: {
      priceHistory: [
        {
          actorUserId: "user_owner",
          effectiveAt: "2026-07-11T08:00:00.000Z",
          id: "metadata_price_123",
          previousPriceMinor: 17_000,
          priceMinor: 18_000,
          reason: "Opening price",
          source: "retail_ops_product_setup",
        },
        {
          actorUserId: "user_owner",
          effectiveAt: "2026-07-13T08:00:00.000Z",
          id: "future_metadata_price",
          previousPriceMinor: 18_000,
          priceMinor: 20_000,
          reason: "Future price",
          source: "retail_ops_unit_price_update",
        },
      ],
    },
  }
  const db = {
    product: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.findMany", where })

        return [
          {
            currencyCode: "NGN",
            id: "product_123",
            name: "Rice",
            slug: "rice",
            variants: [
              {
                id: "variant_bag",
                isDefault: true,
                metadata: variantMetadata,
                name: "Bag",
                priceMinor: 19_000,
                sku: "rice-bag",
              },
            ],
          },
        ]
      },
    },
    productUnitPriceHistory: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productUnitPriceHistory.findMany", where })

        return [
          {
            changedByUserId: "user_owner",
            effectiveAt: new Date("2026-07-12T08:00:00.000Z"),
            id: "durable_price_123",
            previousPriceMinor: 18_000,
            priceMinor: 19_000,
            product: {
              currencyCode: "NGN",
              id: "product_123",
              name: "Rice",
              slug: "rice",
            },
            productVariant: {
              id: "variant_bag",
              isDefault: true,
              name: "Bag",
              priceMinor: 19_000,
              sku: "rice-bag",
            },
            reason: "Market price update",
            source: "MANUAL",
          },
        ]
      },
    },
    productVariant: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productVariant.findMany", where })

        return [
          {
            id: "variant_bag",
            isDefault: true,
            metadata: variantMetadata,
            name: "Bag",
            priceMinor: 19_000,
            product: {
              currencyCode: "NGN",
              id: "product_123",
              name: "Rice",
              slug: "rice",
            },
            sku: "rice-bag",
          },
        ]
      },
    },
    productUnitTemplate: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productUnitTemplate.findMany", where })

        return [
          {
            baseUnitName: "Sack",
            description: "Business-specific sack units",
            id: "template_custom_sack",
            isSystem: false,
            key: "bag_fractions",
            name: "Custom sacks",
            sortOrder: 5,
            units: [
              {
                id: "template_custom_sack:sack",
                isBase: true,
                key: "sack",
                name: "Sack",
                ratioDenominator: 1,
                ratioNumerator: 1,
                sortOrder: 10,
              },
              {
                id: "template_custom_sack:half-sack",
                isBase: false,
                key: "half_sack",
                name: "Half sack",
                ratioDenominator: 2,
                ratioNumerator: 1,
                sortOrder: 20,
              },
            ],
          },
        ]
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function getCalls(calls: ProductCall[], kind: string) {
  return calls.filter((entry) => entry.kind === kind)
}

function getCall(calls: ProductCall[], kind: string) {
  const call = calls.find((entry) => entry.kind === kind)
  expect(call).toBeDefined()

  return call
}

describe("retail ops product queries", () => {
  test("lists unit templates by merging durable tenant templates over fallback defaults", async () => {
    const db = createMockProductReadsDb()

    const templates = await listRetailOpsProductUnitTemplates(db.client, {
      tenantId: "tenant_123",
    })

    expect(templates[0]).toMatchObject({
      baseUnitName: "Sack",
      description: "Business-specific sack units",
      id: "template_custom_sack",
      isSystem: false,
      key: "bag_fractions",
      name: "Custom sacks",
      sortOrder: 5,
      source: "durable",
      units: [
        {
          conversionMultiplier: 1,
          id: "template_custom_sack:sack",
          isBase: true,
          key: "sack",
          name: "Sack",
          ratioDenominator: 1,
          ratioNumerator: 1,
          sortOrder: 10,
        },
        {
          conversionMultiplier: 0.5,
          id: "template_custom_sack:half-sack",
          isBase: false,
          key: "half_sack",
          name: "Half sack",
          ratioDenominator: 2,
          ratioNumerator: 1,
          sortOrder: 20,
        },
      ],
    })
    expect(templates.some((template) => template.key === "bag_fractions")).toBe(
      true,
    )
    expect(
      templates.filter((template) => template.key === "bag_fractions"),
    ).toHaveLength(1)
    expect(getCall(db.calls, "productUnitTemplate.findMany")).toMatchObject({
      where: {
        OR: [
          {
            isSystem: true,
          },
          {
            tenantId: "tenant_123",
          },
        ],
        isActive: true,
      },
    })
  })

  test("lists product unit price history by merging durable rows with metadata fallback rows", async () => {
    const db = createMockProductReadsDb()

    const history = await listRetailOpsProductUnitPriceHistory(db.client, {
      from: new Date("2026-07-10T00:00:00.000Z"),
      limit: 10,
      productVariantId: "variant_bag",
      storeId: "store_123",
      tenantId: "tenant_123",
      to: new Date("2026-07-12T23:59:59.999Z"),
    })

    expect(history).toEqual([
      {
        actorUserId: "user_owner",
        currentPriceMinor: 19_000,
        effectiveAt: "2026-07-12T08:00:00.000Z",
        id: "durable_price_123",
        previousPriceMinor: 18_000,
        priceMinor: 19_000,
        product: {
          currencyCode: "NGN",
          id: "product_123",
          name: "Rice",
          slug: "rice",
        },
        reason: "Market price update",
        source: "retail_ops_unit_price_update",
        unit: {
          id: "variant_bag",
          isDefault: true,
          name: "Bag",
          sku: "rice-bag",
        },
      },
      {
        actorUserId: "user_owner",
        currentPriceMinor: 19_000,
        effectiveAt: "2026-07-11T08:00:00.000Z",
        id: "metadata_price_123",
        previousPriceMinor: 17_000,
        priceMinor: 18_000,
        product: {
          currencyCode: "NGN",
          id: "product_123",
          name: "Rice",
          slug: "rice",
        },
        reason: "Opening price",
        source: "retail_ops_product_setup",
        unit: {
          id: "variant_bag",
          isDefault: true,
          name: "Bag",
          sku: "rice-bag",
        },
      },
    ])
    expect(getCall(db.calls, "productVariant.findMany")).toMatchObject({
      where: {
        id: "variant_bag",
        isActive: true,
        product: {
          status: {
            not: "ARCHIVED",
          },
          storeId: "store_123",
          tenantId: "tenant_123",
        },
      },
    })
    expect(getCall(db.calls, "productUnitPriceHistory.findMany")).toMatchObject(
      {
        where: {
          effectiveAt: {
            gte: new Date("2026-07-10T00:00:00.000Z"),
            lte: new Date("2026-07-12T23:59:59.999Z"),
          },
          product: {
            status: {
              not: "ARCHIVED",
            },
          },
          productVariant: {
            isActive: true,
          },
          productVariantId: "variant_bag",
          storeId: "store_123",
          tenantId: "tenant_123",
        },
      },
    )
  })

  test("creates first product units with opening stock movements and durable price history", async () => {
    const db = createMockProductSetupDb()

    const result = await createRetailOpsProduct(db.client, {
      actorUserId: "user_owner",
      description: "Local rice inventory",
      externalId: " local_product_123 ",
      imageUrl: "https://cdn.example.com/products/rice.png",
      name: "Rice",
      openingStockQuantity: 10,
      priceMinor: 18_500,
      primaryUnitName: " Bag ",
      storeId: "store_123",
      tenantId: "tenant_123",
      unitTemplateKey: "bag_fractions",
      variants: [
        {
          conversionMultiplier: 0.5,
          name: "Half bag",
          openingStockQuantity: 4,
          priceMinor: 9_500,
        },
        {
          conversionMultiplier: 0.25,
          name: "Quarter bag",
          openingStockQuantity: 8,
          priceMinor: 5_000,
        },
      ],
    })

    expect(result).toMatchObject({
      product: {
        currencyCode: "NGN",
        id: "product_123",
        name: "Rice",
        slug: "rice",
      },
      units: [
        {
          conversionMultiplier: 1,
          id: "variant_1",
          isDefault: true,
          name: "Bag",
          openingStockQuantity: 10,
          priceMinor: 18_500,
          sku: "rice-1-bag",
        },
        {
          conversionMultiplier: 0.5,
          id: "variant_2",
          isDefault: false,
          name: "Half bag",
          openingStockQuantity: 4,
          priceMinor: 9_500,
          sku: "rice-2-half-bag",
        },
        {
          conversionMultiplier: 0.25,
          id: "variant_3",
          isDefault: false,
          name: "Quarter bag",
          openingStockQuantity: 8,
          priceMinor: 5_000,
          sku: "rice-3-quarter-bag",
        },
      ],
    })
    expect(getCall(db.calls, "store.findFirst")).toMatchObject({
      where: {
        id: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "product.create")).toMatchObject({
      data: {
        currencyCode: "NGN",
        description: "Local rice inventory",
        listPriceMinor: 18_500,
        metadata: {
          retailOps: {
            actorUserId: "user_owner",
            externalId: "local_product_123",
            imageUrl: "https://cdn.example.com/products/rice.png",
            primaryUnitName: "Bag",
            source: "retail_ops_product_setup",
            unitTemplateKey: "bag_fractions",
            unitTemplateSource: "fallback",
          },
        },
        name: "Rice",
        slug: "rice",
        status: "ACTIVE",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })

    const variantCreates = getCalls(db.calls, "productVariant.create")
    expect(variantCreates).toHaveLength(3)
    expect(variantCreates[0]).toMatchObject({
      data: {
        conversionRatioDenominator: 1,
        conversionRatioNumerator: 1,
        isDefault: true,
        name: "Bag",
        priceMinor: 18_500,
      },
    })
    expect(variantCreates[1]).toMatchObject({
      data: {
        conversionRatioDenominator: 2,
        conversionRatioNumerator: 1,
        isDefault: false,
        name: "Half bag",
        priceMinor: 9_500,
      },
    })
    expect(variantCreates[2]).toMatchObject({
      data: {
        conversionRatioDenominator: 4,
        conversionRatioNumerator: 1,
        isDefault: false,
        name: "Quarter bag",
        priceMinor: 5_000,
      },
    })

    const inventoryCreates = getCalls(db.calls, "inventoryItem.create")
    expect(inventoryCreates).toHaveLength(3)
    expect(inventoryCreates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            onHandQuantity: 10,
            productVariantId: "variant_1",
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            onHandQuantity: 4,
            productVariantId: "variant_2",
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            onHandQuantity: 8,
            productVariantId: "variant_3",
          }),
        }),
      ]),
    )

    const movementUpserts = getCalls(db.calls, "inventoryMovement.upsert")
    expect(movementUpserts).toHaveLength(3)
    expect(movementUpserts[0]).toMatchObject({
      data: {
        create: {
          actorUserId: "user_owner",
          direction: "INBOUND",
          externalId: "opening_stock:product_123:variant_1",
          metadata: {
            retailOps: {
              productSetupExternalId: "local_product_123",
              source: "retail_ops_product_setup",
            },
          },
          movementGroupId: "product_setup:local_product_123",
          note: "Initial product setup",
          onHandQuantity: 10,
          previousOnHandQuantity: 0,
          quantity: 10,
          source: "PRODUCT_SETUP",
          sourceReferenceId: "local_product_123",
          type: "OPENING_STOCK",
        },
      },
      where: {
        tenantId_storeId_type_externalId: {
          externalId: "opening_stock:product_123:variant_1",
          storeId: "store_123",
          tenantId: "tenant_123",
          type: "OPENING_STOCK",
        },
      },
    })

    const priceHistoryUpserts = getCalls(
      db.calls,
      "productUnitPriceHistory.upsert",
    )
    expect(priceHistoryUpserts).toHaveLength(3)
    expect(priceHistoryUpserts[0]).toMatchObject({
      data: {
        create: {
          changedByUserId: "user_owner",
          currencyCode: "NGN",
          metadata: {
            retailOps: {
              source: "retail_ops_product_setup",
            },
          },
          previousPriceMinor: null,
          priceMinor: 18_500,
          productId: "product_123",
          productVariantId: "variant_1",
          reason: "Initial product setup",
          source: "PRODUCT_SETUP",
          storeId: "store_123",
          tenantId: "tenant_123",
        },
      },
    })
  })
})
