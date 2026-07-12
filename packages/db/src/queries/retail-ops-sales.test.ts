import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../generated/prisma/client"
import {
  createRetailOpsSale,
  listRetailOpsCreditSales,
  listRetailOpsSalesByRep,
  recordRetailOpsCreditPayment,
} from "./retail-ops-sales"

type SaleCall = {
  data?: unknown
  kind: string
  where?: unknown
}

function createProductVariantRow() {
  return {
    id: "variant_123",
    metadata: {},
    name: "Bag",
    priceMinor: 18_500,
    sku: "rice-1-bag",
    product: {
      currencyCode: "NGN",
      id: "product_123",
      name: "Rice",
    },
  }
}

function createExistingOrderRow() {
  return {
    id: "order_existing_123",
    orderNumber: "SALE-EXISTING",
    paymentStatus: "PAID",
    status: "COMPLETED",
    totalMinor: 35_000,
    items: [
      {
        metadata: {
          retailOps: {
            unitName: "Bag",
          },
        },
        nameSnapshot: "Rice",
        productId: "product_123",
        productVariant: {
          id: "variant_123",
          name: "Bag",
        },
        productVariantId: "variant_123",
        quantity: 2,
        totalPriceMinor: 35_000,
        unitPriceMinor: 17_500,
      },
    ],
    receipts: [
      {
        id: "receipt_existing_123",
        receiptNumber: "RCPT-EXISTING",
        totalMinor: 35_000,
      },
    ],
  }
}

function createMockSaleDb() {
  const calls: SaleCall[] = []
  const soldAt = new Date("2026-07-12T10:00:00.000Z")
  const productVariant = createProductVariantRow()
  const order = {
    id: "order_123",
    orderNumber: "SALE-123",
    paymentStatus: "PAID",
    status: "COMPLETED",
    totalMinor: 35_000,
  }

  const tx = {
    cashierSession: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "cashierSession.findFirst", where })

        return { id: "session_123" }
      },
    },
    inventoryItem: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findFirst", where })

        return {
          id: "inventory_123",
          onHandQuantity: 10,
          reservedQuantity: 1,
        }
      },
      findUniqueOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findUniqueOrThrow", where })

        return {
          onHandQuantity: 8,
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

        return { id: "movement_123" }
      },
    },
    order: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data, kind: "order.create" })

        return order
      },
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findFirst", where })

        return null
      },
    },
    orderItem: {
      findFirstOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "orderItem.findFirstOrThrow", where })

        return { id: "order_item_123" }
      },
    },
    productUnitPriceHistory: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productUnitPriceHistory.findFirst", where })

        return {
          effectiveAt: new Date("2026-07-10T08:00:00.000Z"),
          priceMinor: 17_500,
        }
      },
    },
    productVariant: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productVariant.findFirst", where })

        return productVariant
      },
    },
    receipt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data, kind: "receipt.create" })

        return {
          id: "receipt_123",
          receiptNumber: "RCPT-123",
          totalMinor: data.totalMinor,
        }
      },
    },
    store: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return {
          id: "store_123",
          metadata: {},
        }
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
    soldAt,
  }
}

function createMockExistingSaleDb() {
  const calls: SaleCall[] = []
  const existingOrder = createExistingOrderRow()

  const tx = {
    inventoryItem: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findFirst", where })

        return {
          onHandQuantity: 8,
        }
      },
    },
    order: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findFirst", where })

        return existingOrder
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
  }
}

function createValidCreditPayment(overrides: Record<string, unknown> = {}) {
  return {
    amountMinor: 5_000,
    balanceMinor: 25_000,
    cashierSessionId: "session_123",
    externalId: "credit_payment_existing",
    id: "PAY-EXISTING",
    note: "Initial deposit",
    paidAt: "2026-07-11T08:00:00.000Z",
    paymentMethod: "cash",
    previousPaidMinor: 0,
    receipt: {
      id: "receipt_existing_credit",
      receiptNumber: "RCPT-CREDIT-EXISTING",
      totalMinor: 5_000,
    },
    receivedByUserId: "user_cashier",
    totalMinor: 30_000,
    ...overrides,
  }
}

function createMockCreditReportDb() {
  const calls: SaleCall[] = []
  const orders = [
    {
      id: "order_credit_123",
      orderNumber: "SALE-CREDIT-123",
      status: "COMPLETED",
      customerEmail: "customer@example.com",
      customerName: "Credit Customer",
      customerPhone: "08000000000",
      currencyCode: "NGN",
      notes: "Pay before delivery",
      metadata: {
        retailOps: {
          actorUserId: "user_cashier",
          cashierSessionId: "session_123",
          creditDueAt: "2000-01-01T00:00:00.000Z",
          creditPayments: [createValidCreditPayment()],
          creditTermsNote: "Customer will settle balance later",
          paymentMethod: "credit",
          paymentState: "credit_partially_paid",
          source: "retail_ops_sale",
        },
      },
      totalMinor: 30_000,
      createdAt: new Date("2026-07-12T09:00:00.000Z"),
      items: [
        {
          id: "order_item_credit_123",
          productId: "product_123",
          productVariantId: "variant_123",
          nameSnapshot: "Rice",
          skuSnapshot: "rice-1-bag",
          quantity: 2,
          unitPriceMinor: 15_000,
          totalPriceMinor: 30_000,
          metadata: {
            retailOps: {
              unitName: "Bag",
            },
          },
          productVariant: {
            name: "Bag",
          },
        },
      ],
    },
    {
      id: "order_cash_123",
      orderNumber: "SALE-CASH-123",
      status: "COMPLETED",
      customerEmail: null,
      customerName: "Cash Customer",
      customerPhone: null,
      currencyCode: "NGN",
      notes: null,
      metadata: {
        retailOps: {
          actorUserId: "user_cashier",
          paymentMethod: "cash",
          paymentState: "paid",
          source: "manual_order",
        },
      },
      totalMinor: 10_000,
      createdAt: new Date("2026-07-12T08:00:00.000Z"),
      items: [],
    },
    {
      id: "order_other_rep",
      orderNumber: "SALE-CREDIT-OTHER",
      status: "COMPLETED",
      customerEmail: null,
      customerName: "Other Customer",
      customerPhone: null,
      currencyCode: "NGN",
      notes: null,
      metadata: {
        retailOps: {
          actorUserId: "user_other",
          paymentMethod: "credit",
          paymentState: "credit_pending",
          source: "retail_ops_sale",
        },
      },
      totalMinor: 50_000,
      createdAt: new Date("2026-07-12T07:00:00.000Z"),
      items: [],
    },
  ]
  const db = {
    order: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ kind: "order.findMany", where: args.where })

        return orders
      },
    },
    user: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ kind: "user.findMany", where: args.where })

        return [
          {
            id: "user_cashier",
            displayName: "Cashier Ada",
            name: "Ada",
            email: "ada@example.com",
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

function createMockSalesByRepReportDb() {
  const calls: SaleCall[] = []
  const orders = [
    {
      paymentStatus: "PAID",
      metadata: {
        retailOps: {
          actorUserId: "user_cashier",
          cashierSessionId: "session_123",
          paymentMethod: "cash",
          paymentState: "paid",
          source: "retail_ops_sale",
        },
      },
      totalMinor: 10_000,
      createdAt: new Date("2026-07-12T09:00:00.000Z"),
      items: [{ quantity: 1 }],
    },
    {
      paymentStatus: "PAID",
      metadata: {
        retailOps: {
          actorUserId: "user_cashier",
          cashierSessionId: "session_456",
          paymentMethod: "bank_transfer",
          paymentState: "paid",
          source: "retail_ops_sale",
        },
      },
      totalMinor: 20_000,
      createdAt: new Date("2026-07-12T10:00:00.000Z"),
      items: [{ quantity: 2 }],
    },
    {
      paymentStatus: "PENDING",
      metadata: {
        retailOps: {
          actorUserId: "user_other",
          cashierSessionId: "session_other",
          paymentMethod: "credit",
          paymentState: "credit_pending",
          source: "retail_ops_sale",
        },
      },
      totalMinor: 40_000,
      createdAt: new Date("2026-07-12T11:00:00.000Z"),
      items: [{ quantity: 4 }],
    },
    {
      paymentStatus: "PAID",
      metadata: {
        retailOps: {
          actorUserId: "user_cashier",
          paymentMethod: "cash",
          paymentState: "paid",
          source: "manual_order",
        },
      },
      totalMinor: 99_000,
      createdAt: new Date("2026-07-12T12:00:00.000Z"),
      items: [{ quantity: 9 }],
    },
  ]
  const db = {
    order: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ kind: "order.findMany", where: args.where })

        return orders
      },
    },
    user: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ kind: "user.findMany", where: args.where })

        return [
          {
            id: "user_cashier",
            displayName: "Cashier Ada",
            name: "Ada",
            email: "ada@example.com",
          },
          {
            id: "user_other",
            displayName: null,
            name: "Other Rep",
            email: "other@example.com",
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

function createMockCreditPaymentDb() {
  const calls: SaleCall[] = []
  const order = {
    id: "order_credit_123",
    orderNumber: "SALE-CREDIT-123",
    paymentStatus: "PENDING",
    status: "COMPLETED",
    totalMinor: 30_000,
    metadata: {
      retailOps: {
        actorUserId: "user_cashier",
        cashierSessionId: "session_123",
        creditPayments: [createValidCreditPayment()],
        paymentMethod: "credit",
        paymentState: "credit_partially_paid",
        source: "retail_ops_sale",
      },
    },
  }
  const tx = {
    cashierSession: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "cashierSession.findFirst", where })

        return { id: "session_123" }
      },
    },
    order: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findFirst", where })

        return order
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "order.update", where })

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          paymentStatus: "PAID",
          status: order.status,
          totalMinor: order.totalMinor,
        }
      },
    },
    receipt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data, kind: "receipt.create" })

        return {
          id: "receipt_credit_123",
          receiptNumber: "RCPT-CREDIT-123",
          totalMinor: data.totalMinor,
        }
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
  }
}

function getCall(calls: SaleCall[], kind: string) {
  const call = calls.find((entry) => entry.kind === kind)
  expect(call).toBeDefined()
  if (!call) {
    throw new Error(`Expected ${kind} call`)
  }

  return call
}

function getCalls(calls: SaleCall[], kind: string) {
  return calls.filter((entry) => entry.kind === kind)
}

describe("retail ops sales queries", () => {
  test("creates a cash sale with sale-time price snapshot, stock deduction, receipt, and movement ledger", async () => {
    const db = createMockSaleDb()

    const result = await createRetailOpsSale(db.client, {
      actorUserId: "user_cashier",
      cashierSessionId: "session_123",
      customerEmail: "customer@example.com",
      customerName: "Customer Name",
      customerPhone: "08000000000",
      externalId: " sale_external_123 ",
      notes: "Customer paid cash",
      paymentMethod: "cash",
      productVariantId: "variant_123",
      quantity: 2,
      soldAt: db.soldAt,
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      inventory: {
        onHandQuantity: 8,
        previousOnHandQuantity: 10,
        productVariantId: "variant_123",
      },
      line: {
        grossMinor: 35_000,
        productId: "product_123",
        productName: "Rice",
        quantity: 2,
        unitName: "Bag",
        unitPriceMinor: 17_500,
      },
      order: {
        id: "order_123",
        orderNumber: "SALE-123",
        paymentStatus: "PAID",
        status: "COMPLETED",
        totalMinor: 35_000,
      },
      receipt: {
        id: "receipt_123",
        receiptNumber: "RCPT-123",
        totalMinor: 35_000,
      },
      staffWallet: null,
    })
    expect(getCall(db.calls, "productVariant.findFirst")).toMatchObject({
      where: {
        id: "variant_123",
        isActive: true,
        product: {
          storeId: "store_123",
          tenantId: "tenant_123",
        },
      },
    })
    expect(getCall(db.calls, "inventoryItem.updateMany")).toMatchObject({
      data: {
        onHandQuantity: {
          decrement: 2,
        },
        updatedByUserId: "user_cashier",
      },
      where: {
        id: "inventory_123",
        onHandQuantity: {
          gte: 3,
        },
        reservedQuantity: 1,
      },
    })
    expect(
      getCall(db.calls, "productUnitPriceHistory.findFirst"),
    ).toMatchObject({
      where: {
        effectiveAt: {
          lte: db.soldAt,
        },
        productVariantId: "variant_123",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "order.create")).toMatchObject({
      data: {
        createdAt: db.soldAt,
        currencyCode: "NGN",
        customerEmail: "customer@example.com",
        customerName: "Customer Name",
        customerPhone: "08000000000",
        metadata: {
          retailOps: {
            actorUserId: "user_cashier",
            cashierSessionId: "session_123",
            externalId: "sale_external_123",
            paymentMethod: "cash",
            paymentState: "paid",
            source: "retail_ops_sale",
            stockSource: "store",
            unitPriceEffectiveAt: "2026-07-10T08:00:00.000Z",
            unitPriceSource: "durable_price_history",
          },
        },
        notes: "Customer paid cash",
        paymentStatus: "PAID",
        status: "COMPLETED",
        storeId: "store_123",
        subtotalMinor: 35_000,
        tenantId: "tenant_123",
        totalMinor: 35_000,
      },
    })
    const orderCreate = getCall(db.calls, "order.create")
    expect(orderCreate.data).toMatchObject({
      items: {
        create: {
          metadata: {
            retailOps: {
              stockMovement: {
                onHandQuantity: 8,
                previousOnHandQuantity: 10,
                source: "store",
                type: "sale",
              },
              unitName: "Bag",
              unitPriceEffectiveAt: "2026-07-10T08:00:00.000Z",
              unitPriceSource: "durable_price_history",
            },
          },
          nameSnapshot: "Rice",
          productId: "product_123",
          productVariantId: "variant_123",
          quantity: 2,
          skuSnapshot: "rice-1-bag",
          totalPriceMinor: 35_000,
          unitPriceMinor: 17_500,
        },
      },
    })
    expect(getCall(db.calls, "inventoryMovement.upsert")).toMatchObject({
      data: {
        create: {
          actorUserId: "user_cashier",
          cashierSessionId: "session_123",
          direction: "OUTBOUND",
          externalId: "sale_external_123",
          inventoryItemId: "inventory_123",
          metadata: {
            retailOps: {
              stockSource: "store",
            },
          },
          movementGroupId: "sale:sale_external_123",
          note: "Customer paid cash",
          onHandQuantity: 8,
          orderId: "order_123",
          orderItemId: "order_item_123",
          previousOnHandQuantity: 10,
          productId: "product_123",
          productVariantId: "variant_123",
          quantity: 2,
          source: "SALE",
          staffUserId: null,
          storeId: "store_123",
          tenantId: "tenant_123",
          type: "SALE_DEDUCTION",
        },
      },
      where: {
        tenantId_storeId_type_externalId: {
          externalId: "sale_external_123",
          storeId: "store_123",
          tenantId: "tenant_123",
          type: "SALE_DEDUCTION",
        },
      },
    })
    expect(getCall(db.calls, "receipt.create")).toMatchObject({
      data: {
        cashierSessionId: "session_123",
        issuedAt: db.soldAt,
        issuedByUserId: "user_cashier",
        orderId: "order_123",
        paymentMethod: "cash",
        storeId: "store_123",
        subtotalMinor: 35_000,
        tenantId: "tenant_123",
        totalMinor: 35_000,
      },
    })
  })

  test("returns an existing sale for duplicate external ids without another stock mutation", async () => {
    const db = createMockExistingSaleDb()

    const result = await createRetailOpsSale(db.client, {
      actorUserId: "user_cashier",
      externalId: " sale_external_123 ",
      paymentMethod: "cash",
      productVariantId: "variant_123",
      quantity: 2,
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      inventory: {
        onHandQuantity: 8,
        previousOnHandQuantity: 8,
        productVariantId: "variant_123",
      },
      line: {
        grossMinor: 35_000,
        productId: "product_123",
        productName: "Rice",
        quantity: 2,
        unitName: "Bag",
        unitPriceMinor: 17_500,
      },
      order: {
        id: "order_existing_123",
        orderNumber: "SALE-EXISTING",
        paymentStatus: "PAID",
        status: "COMPLETED",
        totalMinor: 35_000,
      },
      receipt: {
        id: "receipt_existing_123",
        receiptNumber: "RCPT-EXISTING",
        totalMinor: 35_000,
      },
      staffWallet: null,
    })
    expect(getCall(db.calls, "order.findFirst")).toMatchObject({
      where: {
        AND: [
          {
            metadata: {
              equals: "retail_ops_sale",
              path: ["retailOps", "source"],
            },
          },
          {
            metadata: {
              equals: "sale_external_123",
              path: ["retailOps", "externalId"],
            },
          },
        ],
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCalls(db.calls, "inventoryItem.updateMany")).toHaveLength(0)
    expect(getCalls(db.calls, "order.create")).toHaveLength(0)
    expect(getCalls(db.calls, "receipt.create")).toHaveLength(0)
    expect(getCalls(db.calls, "inventoryMovement.upsert")).toHaveLength(0)
  })

  test("lists credit sales with actor scope, aging, balances, and previous payments", async () => {
    const db = createMockCreditReportDb()

    const result = await listRetailOpsCreditSales(db.client, {
      actorUserId: "user_cashier",
      from: new Date("2026-07-01T00:00:00.000Z"),
      limit: 10,
      storeId: "store_123",
      tenantId: "tenant_123",
      to: new Date("2026-07-31T23:59:59.999Z"),
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      actor: {
        displayName: "Cashier Ada",
        email: "ada@example.com",
        id: "user_cashier",
      },
      aging: {
        bucket: "31_plus_days_overdue",
      },
      amountDueMinor: 25_000,
      balanceMinor: 25_000,
      creditTermsNote: "Customer will settle balance later",
      customer: {
        email: "customer@example.com",
        name: "Credit Customer",
        phone: "08000000000",
      },
      id: "order_credit_123",
      lines: [
        {
          productId: "product_123",
          productName: "Rice",
          productVariantId: "variant_123",
          quantity: 2,
          totalMinor: 30_000,
          unitName: "Bag",
          unitPriceMinor: 15_000,
        },
      ],
      paidMinor: 5_000,
      paymentState: "credit_partially_paid",
      totalMinor: 30_000,
    })
    expect(result[0]?.payments[0]).toMatchObject({
      amountMinor: 5_000,
      balanceMinor: 25_000,
      externalId: "credit_payment_existing",
      id: "PAY-EXISTING",
      paymentMethod: "cash",
      previousPaidMinor: 0,
      receipt: {
        id: "receipt_existing_credit",
        receiptNumber: "RCPT-CREDIT-EXISTING",
        totalMinor: 5_000,
      },
      receivedByUserId: "user_cashier",
    })
    expect(getCall(db.calls, "order.findMany")).toMatchObject({
      where: {
        createdAt: {
          gte: new Date("2026-07-01T00:00:00.000Z"),
          lte: new Date("2026-07-31T23:59:59.999Z"),
        },
        paymentStatus: "PENDING",
        status: {
          not: "CANCELLED",
        },
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "user.findMany")).toMatchObject({
      where: {
        id: {
          in: ["user_cashier"],
        },
      },
    })
  })

  test("groups retail ops sales by rep with payment buckets and session counts", async () => {
    const db = createMockSalesByRepReportDb()

    const result = await listRetailOpsSalesByRep(db.client, {
      from: new Date("2026-07-12T00:00:00.000Z"),
      storeId: "store_123",
      tenantId: "tenant_123",
      to: new Date("2026-07-12T23:59:59.999Z"),
    })

    expect(result).toEqual([
      {
        actorUserId: "user_other",
        cashMinor: 0,
        cashierSessionIds: ["session_other"],
        cardMinor: 0,
        creditMinor: 40_000,
        displayName: "Other Rep",
        email: "other@example.com",
        grossMinor: 40_000,
        lastSoldAt: new Date("2026-07-12T11:00:00.000Z"),
        orderCount: 1,
        quantity: 4,
        transferMinor: 0,
      },
      {
        actorUserId: "user_cashier",
        cashMinor: 10_000,
        cashierSessionIds: ["session_123", "session_456"],
        cardMinor: 0,
        creditMinor: 0,
        displayName: "Cashier Ada",
        email: "ada@example.com",
        grossMinor: 30_000,
        lastSoldAt: new Date("2026-07-12T10:00:00.000Z"),
        orderCount: 2,
        quantity: 3,
        transferMinor: 20_000,
      },
    ])
    expect(getCall(db.calls, "order.findMany")).toMatchObject({
      where: {
        createdAt: {
          gte: new Date("2026-07-12T00:00:00.000Z"),
          lte: new Date("2026-07-12T23:59:59.999Z"),
        },
        status: {
          not: "CANCELLED",
        },
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "user.findMany")).toMatchObject({
      where: {
        id: {
          in: ["user_cashier", "user_other"],
        },
      },
    })
  })

  test("records a credit payment with receipt and settled balance metadata", async () => {
    const db = createMockCreditPaymentDb()
    const paidAt = new Date("2026-07-12T12:00:00.000Z")

    const result = await recordRetailOpsCreditPayment(db.client, {
      actorUserId: "user_cashier",
      amountMinor: 25_000,
      cashierSessionId: "session_123",
      externalId: " credit_payment_final ",
      notes: "Customer completed transfer",
      orderId: "order_credit_123",
      paidAt,
      paymentMethod: "transfer",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      balanceMinor: 0,
      order: {
        id: "order_credit_123",
        orderNumber: "SALE-CREDIT-123",
        paymentStatus: "PAID",
        status: "COMPLETED",
        totalMinor: 30_000,
      },
      paidMinor: 30_000,
      payment: {
        amountMinor: 25_000,
        balanceMinor: 0,
        cashierSessionId: "session_123",
        externalId: "credit_payment_final",
        note: "Customer completed transfer",
        paidAt,
        paymentMethod: "transfer",
        previousPaidMinor: 5_000,
        receipt: {
          id: "receipt_credit_123",
          receiptNumber: "RCPT-CREDIT-123",
          totalMinor: 25_000,
        },
        receivedByUserId: "user_cashier",
        totalMinor: 30_000,
      },
      previousPaidMinor: 5_000,
    })
    expect(result.payment.id).toMatch(/^PAY-/)
    expect(getCall(db.calls, "cashierSession.findFirst")).toMatchObject({
      where: {
        id: "session_123",
        status: "OPEN",
        storeId: "store_123",
        tenantId: "tenant_123",
        userId: "user_cashier",
      },
    })
    expect(getCall(db.calls, "receipt.create")).toMatchObject({
      data: {
        cashierSessionId: "session_123",
        issuedAt: paidAt,
        issuedByUserId: "user_cashier",
        orderId: "order_credit_123",
        paymentMethod: "bank_transfer",
        storeId: "store_123",
        subtotalMinor: 25_000,
        tenantId: "tenant_123",
        totalMinor: 25_000,
      },
    })
    expect(getCall(db.calls, "order.update")).toMatchObject({
      data: {
        metadata: {
          retailOps: {
            creditBalanceMinor: 0,
            creditPaidMinor: 30_000,
            paymentState: "credit_paid",
          },
        },
        paymentStatus: "PAID",
      },
      where: {
        id: "order_credit_123",
      },
    })
    const update = getCall(db.calls, "order.update")
    expect(update.data).toMatchObject({
      metadata: {
        retailOps: {
          creditPayments: [
            {
              amountMinor: 25_000,
              balanceMinor: 0,
              cashierSessionId: "session_123",
              externalId: "credit_payment_final",
              note: "Customer completed transfer",
              paidAt: paidAt.toISOString(),
              paymentMethod: "transfer",
              previousPaidMinor: 5_000,
              receivedByUserId: "user_cashier",
              totalMinor: 30_000,
            },
            createValidCreditPayment(),
          ],
        },
      },
    })
  })
})
