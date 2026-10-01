import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { BillingProvider } from "../../generated/prisma/enums"
import {
  recordPlayVoidedOrder,
  storeOrderDigest,
  storePurchaseDigest,
  storeVoidedOrderEventId,
} from "./store-subscriptions"

function fixture(
  existingPurchaseTenant?: string,
  persistedOrderId = "GPA.current-order",
) {
  const events = new Map<string, Record<string, unknown>>()
  const updates: Array<Record<string, unknown>> = []
  const tx = {
    storeBillingAccount: {
      findUnique: async () => ({ id: "opaque-account" }),
    },
    storeSubscriptionPurchase: {
      findUnique: async () =>
        existingPurchaseTenant
          ? {
              tenantId: existingPurchaseTenant,
              latestOrderDigest: storeOrderDigest(persistedOrderId),
            }
          : null,
    },
    billingProviderEvent: {
      upsert: async ({
        where,
        create,
      }: {
        where: { provider_eventId: { eventId: string } }
        create: Record<string, unknown>
      }) => {
        const key = where.provider_eventId.eventId
        if (!events.has(key)) events.set(key, create)
        return events.get(key)
      },
    },
    tenantSubscription: {
      updateMany: async (input: Record<string, unknown>) => {
        updates.push(input)
        return { count: 1 }
      },
    },
  }
  return {
    db: {
      $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
    } as unknown as PrismaClient,
    events,
    updates,
  }
}

const input = {
  tenantId: "demo-tenant",
  accountToken: "opaque-account",
  purchaseId: "sensitive-purchase-token",
  orderId: "GPA.current-order",
  latestOrderId: "GPA.current-order",
  observedAt: new Date("2026-09-25T11:00:00Z"),
}

describe("Play voided renewal order", () => {
  test("records only digests and cuts off the exact current purchase", async () => {
    const state = fixture("demo-tenant")
    expect(await recordPlayVoidedOrder(state.db, input)).toEqual({
      currentOrder: true,
    })
    expect(state.events.size).toBe(1)
    const event = state.events.get(storeVoidedOrderEventId(input.orderId))
    expect(event).toMatchObject({
      provider: BillingProvider.PLAY_STORE,
      tenantId: input.tenantId,
      payload: {
        purchaseDigest: storePurchaseDigest("play_store", input.purchaseId),
        orderDigest: storeOrderDigest(input.orderId),
      },
    })
    expect(JSON.stringify(event)).not.toContain(input.purchaseId)
    expect(JSON.stringify(event)).not.toContain(input.orderId)
    expect(state.updates).toEqual([
      {
        where: {
          tenantId: input.tenantId,
          provider: BillingProvider.PLAY_STORE,
          billingSubscriptionId: storePurchaseDigest(
            "play_store",
            input.purchaseId,
          ),
          status: "ACTIVE",
        },
        data: expect.objectContaining({
          status: "CANCELLED",
          cancelAtPeriodEnd: false,
        }),
      },
    ])
  })

  test("a historical void and its replay leave a later paid renewal alone", async () => {
    const state = fixture("demo-tenant", "GPA.newer-paid-order")
    const historical = { ...input, latestOrderId: "GPA.newer-paid-order" }
    await recordPlayVoidedOrder(state.db, historical)
    await recordPlayVoidedOrder(state.db, historical)
    expect(state.events.size).toBe(1)
    expect(state.updates).toEqual([])
  })

  test("a stale provider read cannot cancel a newer persisted renewal", async () => {
    const state = fixture("demo-tenant", "GPA.newer-paid-order")
    expect(await recordPlayVoidedOrder(state.db, input)).toEqual({
      currentOrder: false,
    })
    expect(state.events.size).toBe(1)
    expect(state.updates).toEqual([])
  })

  test("refuses a purchase already assigned to another workspace", async () => {
    const state = fixture("unrelated-tenant")
    expect(recordPlayVoidedOrder(state.db, input)).rejects.toThrow(
      "another workspace",
    )
    expect(state.events.size).toBe(0)
  })
})
