import { describe, expect, test } from "bun:test"
import { defaultReceiptSettings } from "@ewatrade/order-receipts"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  getOrderReceiptSettings,
  getOrderReceipts,
  saveOrderReceiptSettings,
} from "./order-receipts"

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "ORD-001",
    status: "COMPLETED",
    paymentStatus: "PARTIALLY_PAID",
    createdAt: new Date("2026-10-03T09:00:00Z"),
    currencyCode: "NGN",
    customerName: "Amina",
    subtotalMinor: 10000,
    totalMinor: 10000,
    discountMinor: 0,
    serviceChargeMinor: 0,
    taxMinor: 0,
    amountPaidMinor: 4000,
    store: { name: "Store", metadata: null },
    tenant: { name: "Business", metadata: null, timezone: "Africa/Lagos" },
    lines: [
      {
        id: "line-1",
        quantity: "2",
        unitPriceMinor: 5000,
        totalMinor: 10000,
        snapshot: {
          catalogItemName: "Recorded name",
          variantName: "Blue · Large",
          inventoryUnitName: "Pack",
        },
      },
    ],
    payments: [
      {
        id: "pay-1",
        type: "PAYMENT",
        method: "CASH",
        amountMinor: 6000,
        recordedAt: new Date(),
      },
      {
        id: "refund-1",
        type: "REFUND",
        method: "CASH",
        amountMinor: 2000,
        recordedAt: new Date(),
      },
    ],
    ...overrides,
  }
}
function fake(records: unknown[]) {
  const calls: unknown[] = []
  const tx = {
    commercialOrder: {
      findMany: async (input: unknown) => {
        calls.push(input)
        return records
      },
    },
  }
  const db = {
    $transaction: async (
      work: (tx: unknown) => Promise<unknown>,
      options: unknown,
    ) => {
      calls.push(options)
      return work(tx)
    },
  } as unknown as PrismaClient
  return { db, calls }
}
const scope = { tenantId: "tenant", storeId: "store", orderIds: ["order-1"] }

describe("scoped receipt projection", () => {
  test("preserves manual whole-item price and weight note without inventing a unit price", async () => {
    const note = "5 Birds; 10 kg after dressing at NGN3000/kg"
    const first = order().lines[0]
    if (!first) throw new Error("Missing receipt fixture line")
    const record = order({
      lines: [
        {
          ...first,
          quantity: "5",
          unitPriceMinor: null,
          totalMinor: 3000000,
          snapshot: { ...first.snapshot, note },
        },
      ],
    })
    const [receipt] = await getOrderReceipts(fake([record]).db, scope)
    expect(receipt?.lines[0]).toMatchObject({
      quantity: "5",
      unitPriceMinor: null,
      totalMinor: 3000000,
      note,
    })
  })
  test("captures complete source in a consistent transaction, retains refunds and exact quantities", async () => {
    const { db, calls } = fake([order()])
    const [receipt] = await getOrderReceipts(db, scope)
    expect(calls[0]).toEqual({
      isolationLevel: "RepeatableRead",
      maxWait: 10000,
      timeout: 30000,
    })
    expect(calls[1]).toMatchObject({
      where: { tenantId: "tenant", storeId: "store", id: { in: ["order-1"] } },
      include: { lines: { take: 201 }, payments: { take: 201 } },
    })
    expect(receipt).toMatchObject({
      receivedMinor: 4000,
      refundedMinor: 2000,
      balanceMinor: 6000,
      paymentLabel: "Part paid · refund recorded",
      lines: [{ name: "Recorded name · Blue · Large", quantity: "2" }],
    })
  })
  test("does not infer payment from a historical paid status", async () => {
    const { db } = fake([
      order({ paymentStatus: "PAID", amountPaidMinor: 0, payments: [] }),
    ])
    expect((await getOrderReceipts(db, scope))[0]).toMatchObject({
      receivedMinor: 0,
      balanceMinor: 10000,
      paymentLabel: "Historical payment details unavailable",
    })
  })
  test("inherits business settings and honors a Store override", async () => {
    const business = {
      ...defaultReceiptSettings,
      thankYouNote: "Business note",
    }
    const store = {
      ...business,
      showCustomerName: false,
      showPaymentBreakdown: false,
      thankYouNote: "Store note",
    }
    const { db } = fake([
      order({
        tenant: {
          name: "Business",
          metadata: { orderReceiptSettings: business },
          timezone: "Africa/Lagos",
        },
        store: { name: "Store", metadata: { orderReceiptSettings: store } },
      }),
    ])
    expect((await getOrderReceipts(db, scope))[0]).toMatchObject({
      customerName: null,
      payments: [],
      settings: store,
      settingsSource: "store",
      paymentLabel: "Part paid · refund recorded",
    })
  })
  test("rejects missing or foreign selections without returning a partial group", async () => {
    const { db } = fake([order()])
    await expect(
      getOrderReceipts(db, { ...scope, orderIds: ["order-1", "foreign"] }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" })
  })
  test("rejects canceled, duplicate and over-budget exports", async () => {
    await expect(
      getOrderReceipts(fake([order({ status: "CANCELLED" })]).db, scope),
    ).rejects.toThrow("Canceled")
    await expect(
      getOrderReceipts(fake([]).db, {
        ...scope,
        orderIds: ["order-1", "order-1"],
      }),
    ).rejects.toThrow("distinct")
    await expect(
      getOrderReceipts(
        fake([order({ lines: Array.from({ length: 201 }, () => ({})) })]).db,
        scope,
      ),
    ).rejects.toThrow("too large")
  })
})

describe("saved receipt settings", () => {
  test("defaults and missing Store authorization", async () => {
    const calls: unknown[] = []
    const db = {
      store: {
        findFirst: async (input: unknown) => {
          calls.push(input)
          return {
            id: "store",
            name: "Store",
            metadata: null,
            tenant: { name: "Business", metadata: null },
          }
        },
      },
    } as unknown as PrismaClient
    expect(await getOrderReceiptSettings(db, scope)).toMatchObject({
      business: defaultReceiptSettings,
      override: null,
      source: "business",
    })
    expect(calls[0]).toMatchObject({
      where: { id: "store", tenantId: "tenant" },
    })
    await expect(
      getOrderReceiptSettings(
        { store: { findFirst: async () => null } } as unknown as PrismaClient,
        scope,
      ),
    ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" })
  })
  test("saves only its JSONB key with parameterized Tenant/Store scope and removes the override", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const db = {
      $executeRaw: async (query: { sql: string; values: unknown[] }) => {
        calls.push(query)
        return 1
      },
      store: {
        findFirst: async () => ({
          id: "store",
          name: "Store",
          metadata: null,
          tenant: { name: "Business", metadata: null },
        }),
      },
    } as unknown as PrismaClient
    await saveOrderReceiptSettings(db, {
      ...scope,
      scope: "business",
      settings: defaultReceiptSettings,
    })
    expect(calls[0]?.sql).toContain("jsonb_set")
    expect(calls[0]?.values).toEqual([
      JSON.stringify(defaultReceiptSettings),
      "tenant",
      "store",
      "tenant",
    ])
    await saveOrderReceiptSettings(db, {
      ...scope,
      scope: "store",
      settings: null,
    })
    expect(calls[1]?.sql).toContain("- 'orderReceiptSettings'")
    expect(calls[1]?.values).toEqual(["store", "tenant"])
    await expect(
      saveOrderReceiptSettings(db, {
        ...scope,
        scope: "business",
        settings: null,
      }),
    ).rejects.toThrow("cannot be removed")
  })
})
