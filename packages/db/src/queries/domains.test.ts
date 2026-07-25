import { describe, expect, test } from "bun:test"

import {
  createExternalDomainConnection,
  markDomainOrderPaid,
  reconcileManagedDomain,
  recordDomainRefundEvent,
} from "./domains"
import type { DbClient } from "./types"

describe("managed domain queries", () => {
  test("rejects a hostname already owned by another workspace", async () => {
    let upsertCalled = false
    const db = {
      domainConnection: {
        findUnique: async () => null,
        upsert: async () => {
          upsertCalled = true
        },
      },
      store: {
        findFirst: async () => ({ id: "store_1" }),
      },
      tenantHostname: {
        findUnique: async () => ({ tenantId: "tenant_other" }),
      },
    } as unknown as DbClient

    await expect(
      createExternalDomainConnection(db, {
        hostname: "acme.com",
        ownershipTokenHash: "hash",
        ownershipTokenValue: "token",
        storeId: "store_1",
        tenantId: "tenant_1",
        vercelProjectId: "project_1",
      }),
    ).rejects.toThrow("This hostname belongs to another workspace.")
    expect(upsertCalled).toBe(false)
  })

  test("does not promote an unknown registrar state to active", async () => {
    let updateData: Record<string, unknown> | undefined
    const db = {
      managedDomain: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data
          return data
        },
      },
    } as unknown as DbClient

    await reconcileManagedDomain(db, {
      expiresAt: null,
      managedDomainId: "domain_1",
      providerDomainId: null,
      providerStatus: "unknown",
    })

    expect(updateData?.status).toBeUndefined()
  })

  test("maps an authoritative active state to the managed domain", async () => {
    let updateData: Record<string, unknown> | undefined
    const db = {
      managedDomain: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data
          return data
        },
      },
    } as unknown as DbClient

    await reconcileManagedDomain(db, {
      expiresAt: new Date("2027-07-24T00:00:00.000Z"),
      managedDomainId: "domain_1",
      providerDomainId: "provider_1",
      providerStatus: "active",
    })

    expect(updateData).toMatchObject({
      providerDomainId: "provider_1",
      status: "ACTIVE",
    })
  })

  test("does not revive an order after its refund started", async () => {
    let updateCalled = false
    const refundedOrder = {
      amountMinor: 100_000,
      checkoutUrl: null,
      createdAt: new Date("2026-07-24T00:00:00.000Z"),
      currencyCode: "NGN",
      failureCode: "REGISTRATION_FAILED",
      failureMessage: "Registration failed",
      id: "order_1",
      normalizedDomain: "acme.com.ng",
      paymentReference: "payment_1",
      paymentStatus: "REFUND_PENDING",
      provider: "GO54",
      registeredAt: null,
      registrationStatus: "FAILED",
      updatedAt: new Date("2026-07-24T00:00:00.000Z"),
    }
    const tx = {
      domainOrder: {
        findUnique: async () => refundedOrder,
        update: async () => {
          updateCalled = true
        },
      },
    }
    const db = {
      $transaction: async (
        operation: (transaction: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    }

    const result = await markDomainOrderPaid(db as never, {
      amountMinor: 100_000,
      currencyCode: "NGN",
      paymentReference: "payment_1",
      providerEventId: "charge.success:payment_1",
      rawEvent: {},
    })

    expect(result.newlyPaid).toBe(false)
    expect(result.order.paymentStatus).toBe("REFUND_PENDING")
    expect(updateCalled).toBe(false)
  })

  test("records non-terminal refund webhooks idempotently", async () => {
    let upsertArgs: Record<string, unknown> | undefined
    const tx = {
      domainEvent: {
        upsert: async (args: Record<string, unknown>) => {
          upsertArgs = args
          return args
        },
      },
      domainOrder: {
        findUniqueOrThrow: async () => ({
          id: "order_1",
          provider: "GO54",
          tenantId: "tenant_1",
        }),
      },
    }
    const db = {
      $transaction: async (
        operation: (transaction: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    }

    await recordDomainRefundEvent(db as never, {
      paymentReference: "payment_1",
      providerEventId: "refund.failed:refund_1",
      rawEvent: { event: "refund.failed" },
      status: "FAILED",
    })

    expect(upsertArgs).toMatchObject({
      create: {
        kind: "REFUND",
        orderId: "order_1",
        providerEventId: "refund.failed:refund_1",
        status: "FAILED",
        tenantId: "tenant_1",
      },
      where: {
        provider_providerEventId: {
          provider: "GO54",
          providerEventId: "refund.failed:refund_1",
        },
      },
    })
  })
})
