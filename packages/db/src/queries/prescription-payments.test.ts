import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  attachPrescriptionRefundProviderResult,
  claimPrescriptionRefundProviderDispatch,
  createPrescriptionRefund,
  getPublicPrescriptionPaymentStatus,
  processPrescriptionPaymentProviderEvent,
  resolvePrescriptionRefundReconciliationMiss,
} from "./prescription-payments"

describe("prescription payment provider failures", () => {
  test("records a failed callback without creating payment or receipt facts", async () => {
    const intentUpdates: unknown[] = []
    const transaction = {
      prescriptionPaymentIntent: {
        findUnique: async () => ({
          amountMinor: 2_500,
          currencyCode: "NGN",
          id: "payment-1",
          orderId: "order-1",
          status: "PENDING",
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
        update: async (input: unknown) => {
          intentUpdates.push(input)
          return input
        },
      },
      prescriptionPaymentProviderEvent: {
        create: async () => ({ id: "event-1" }),
        findUnique: async () => null,
        update: async (input: unknown) => input,
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      processPrescriptionPaymentProviderEvent(db, {
        amountMinor: 2_500,
        currencyCode: "NGN",
        eventId: "charge.failed:payment-1",
        provider: "fake-hosted",
        providerReference: "payment-reference-1",
        status: "failed",
      }),
    ).resolves.toEqual({ communicationIntentId: null, replay: false })
    expect(intentUpdates).toEqual([
      {
        data: { failedAt: expect.any(Date), status: "FAILED" },
        where: { id: "payment-1" },
      },
    ])
  })

  test("rejects a mismatched amount before creating payment ledger facts", async () => {
    const eventUpdates: unknown[] = []
    const transaction = {
      prescriptionPaymentIntent: {
        findUnique: async () => ({
          amountMinor: 2_500,
          currencyCode: "NGN",
          id: "payment-1",
          orderId: "order-1",
          status: "PENDING",
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
      },
      prescriptionPaymentProviderEvent: {
        create: async () => ({ id: "event-1" }),
        findUnique: async () => null,
        update: async (input: unknown) => {
          eventUpdates.push(input)
          return input
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      processPrescriptionPaymentProviderEvent(db, {
        amountMinor: 2_400,
        currencyCode: "NGN",
        eventId: "charge.success:payment-1",
        provider: "fake-hosted",
        providerReference: "payment-reference-1",
        status: "paid",
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" })
    expect(eventUpdates).toEqual([
      {
        data: { outcome: "REJECTED", processedAt: expect.any(Date) },
        where: { id: "event-1" },
      },
    ])
  })

  test("projects an expired checkout without exposing Order or prescription data", async () => {
    const db = {
      prescriptionPaymentIntent: {
        findUnique: async () => ({
          currencyCode: "NGN",
          expiresAt: new Date("2026-08-09T09:00:00.000Z"),
          order: { amountPaidMinor: 0, totalMinor: 2_500 },
          orderId: "private-order-1",
          status: "PENDING",
        }),
      },
    } as unknown as PrismaClient

    const status = await getPublicPrescriptionPaymentStatus(db, {
      now: new Date("2026-08-09T10:00:00.000Z"),
      statusToken: "status-token",
    })
    expect(status).toEqual({
      amountPaidMinor: 0,
      balanceDueMinor: 2_500,
      currencyCode: "NGN",
      status: "expired",
      totalMinor: 2_500,
    })
    expect(JSON.stringify(status)).not.toContain("private-order-1")
  })
})

describe("prescription refund provider result", () => {
  test("marks an existing refund command as a replay so provider work is not repeated", async () => {
    const previous = {
      amountMinor: 2_500,
      paymentIntent: { orderId: "order-1" },
      reason: "Customer cancellation",
      storeId: "store-1",
    }
    const transaction = {
      prescriptionPaymentRefund: {
        findUnique: async () => previous,
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    const result = await createPrescriptionRefund(db, {
      actorUserId: "user-1",
      amountMinor: 2_500,
      clientRefundId: "refund-command-1",
      orderId: "order-1",
      reason: "Customer cancellation",
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(result.replay).toBe(true)
    expect(result.refund.amountMinor).toBe(2_500)
    expect(result.refund.paymentIntent.orderId).toBe("order-1")
  })

  test("claims new provider work once and reconciles an unknown outcome on retry", async () => {
    let providerDispatchState = "READY"
    const refund = {
      id: "refund-1",
      paymentIntent: { providerReference: "payment-1" },
    }
    const transaction = {
      $queryRaw: async () => [{ id: "refund-1" }],
      prescriptionPaymentRefund: {
        findFirst: async () => ({ id: "refund-1" }),
        findUnique: async () => ({ ...refund, providerDispatchState }),
        update: async () => {
          providerDispatchState = "OUTCOME_UNKNOWN"
          return { ...refund, providerDispatchState }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    const first = await claimPrescriptionRefundProviderDispatch(db, {
      refundId: "refund-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    const retry = await claimPrescriptionRefundProviderDispatch(db, {
      refundId: "refund-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(first.action).toBe("dispatch")
    expect(retry.action).toBe("reconcile")
  })

  test("requeues one aged reconciliation miss then escalates a repeated miss", async () => {
    const outcomes: string[] = []
    const makeDb = (providerDispatchCount: number) => {
      const transaction = {
        $queryRaw: async () => [{ id: "refund-1" }],
        prescriptionPaymentRefund: {
          findFirst: async () => ({ id: "refund-1" }),
          findUnique: async () => ({
            id: "refund-1",
            paymentIntent: { providerReference: "payment-1" },
            providerDispatchClaimedAt: new Date("2026-08-08T10:00:00.000Z"),
            providerDispatchCount,
            providerDispatchState: "OUTCOME_UNKNOWN",
          }),
          update: async (input: {
            data: { providerDispatchState: string }
          }) => {
            outcomes.push(input.data.providerDispatchState)
            return input
          },
        },
      }
      return {
        $transaction: async (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
      } as unknown as PrismaClient
    }

    await resolvePrescriptionRefundReconciliationMiss(makeDb(1), {
      now: new Date("2026-08-09T12:00:00.000Z"),
      refundId: "refund-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    })
    await resolvePrescriptionRefundReconciliationMiss(makeDb(2), {
      now: new Date("2026-08-09T12:00:00.000Z"),
      refundId: "refund-1",
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(outcomes).toEqual(["READY", "NEEDS_REVIEW"])
  })

  test("records a synchronous provider success in the commercial ledger", async () => {
    const paymentCreates: unknown[] = []
    const orderUpdates: unknown[] = []
    const transaction = {
      $queryRaw: async () => [{ id: "order-1" }],
      commercialOrder: {
        findFirst: async () => ({
          amountPaidMinor: 10_000,
          id: "order-1",
          paymentStatus: "PAID",
          payments: [{ id: "payment-1" }],
          storeId: "store-1",
          totalMinor: 10_000,
        }),
        update: async (input: unknown) => {
          orderUpdates.push(input)
          return input
        },
      },
      commercialOrderPayment: {
        create: async (input: unknown) => {
          paymentCreates.push(input)
          return { id: "refund-ledger-1" }
        },
        findUnique: async () => null,
      },
      prescriptionPaymentIntent: {
        update: async (input: unknown) => input,
      },
      prescriptionPaymentRefund: {
        aggregate: async () => ({ _sum: { amountMinor: 2_500 } }),
        findFirst: async () => ({
          amountMinor: 2_500,
          id: "refund-1",
          paymentIntent: {
            amountMinor: 10_000,
            orderId: "order-1",
          },
          paymentIntentId: "intent-1",
          providerRefundId: null,
          requestedByUserId: "user-1",
        }),
        update: async () => ({ id: "refund-1", status: "SUCCEEDED" }),
      },
      serviceJobLine: { findMany: async () => [] },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await attachPrescriptionRefundProviderResult(db, {
      providerRefundId: "provider-refund-1",
      refundId: "refund-1",
      status: "succeeded",
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(paymentCreates).toHaveLength(1)
    expect(paymentCreates[0]).toMatchObject({
      data: {
        amountMinor: 2_500,
        clientPaymentId: "provider-refund:refund-1",
        orderId: "order-1",
        tenantId: "tenant-1",
        type: "REFUND",
      },
    })
    expect(orderUpdates[0]).toMatchObject({
      data: { amountPaidMinor: 7_500, paymentStatus: "PARTIALLY_PAID" },
    })
  })

  test("reserves pending refunds under a payment-intent lock before provider work", async () => {
    let created = false
    const transaction = {
      $queryRaw: async () => [{ id: "intent-1" }],
      prescriptionPaymentIntent: {
        findFirst: async () => ({
          amountMinor: 10_000,
          id: "intent-1",
        }),
      },
      prescriptionPaymentRefund: {
        aggregate: async () => ({ _sum: { amountMinor: 7_000 } }),
        create: async () => {
          created = true
        },
        findUnique: async () => null,
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      createPrescriptionRefund(db, {
        actorUserId: "user-1",
        amountMinor: 7_000,
        clientRefundId: "refund-command-2",
        orderId: "order-1",
        reason: "Customer cancellation",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow("remaining refundable balance")
    expect(created).toBe(false)
  })
})
