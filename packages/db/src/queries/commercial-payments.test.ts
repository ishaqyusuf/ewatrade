import { describe, expect, test } from "bun:test"

import {
  CommercialPaymentType,
  PaymentStatus,
} from "../../generated/prisma/enums"
import {
  effectiveCommercialAmountPaid,
  listCommercialOrderPaymentsPage,
  summarizeCommercialPayment,
} from "./commercial-payments"
import type { DbClient } from "./types"

describe("listCommercialOrderPaymentsPage", () => {
  test("groups complete received totals by immutable Order currency in one read", async () => {
    const totalCalls: unknown[] = []
    const db = {
      $queryRaw: async (input: unknown) => {
        totalCalls.push(input)
        return [
          {
            currencyCode: "NGN",
            totalAmountMinor: 100_000n,
            totalCount: 2n,
          },
          {
            currencyCode: "USD",
            totalAmountMinor: 25_000n,
            totalCount: 1n,
          },
        ]
      },
      commercialOrderPayment: {
        findMany: async () => [],
      },
    } as unknown as DbClient

    await expect(
      listCommercialOrderPaymentsPage(db, {
        defaultCurrencyCode: "NGN",
        tenantId: "tenant_123",
      }),
    ).resolves.toMatchObject({
      currencyTotals: [
        { currencyCode: "NGN", totalAmountMinor: 100_000 },
        { currencyCode: "USD", totalAmountMinor: 25_000 },
      ],
      items: [],
      totalCount: 3,
    })
    expect(totalCalls).toHaveLength(1)
    const query = totalCalls[0] as { strings: string[]; values: unknown[] }
    expect(query.values).toEqual(["tenant_123", CommercialPaymentType.PAYMENT])
    expect(query.strings.join("?")).toContain(
      'JOIN "CommercialOrder" AS orders',
    )
    expect(query.strings.join("?")).toContain('GROUP BY orders."currencyCode"')
  })
})

describe("summarizeCommercialPayment", () => {
  test("keeps a deposit separate from the outstanding balance", () => {
    expect(
      summarizeCommercialPayment({
        amountPaidMinor: 40_000,
        totalMinor: 97_500,
      }),
    ).toEqual({
      amountPaidMinor: 40_000,
      balanceDueMinor: 57_500,
      paymentStatus: "partially_paid",
    })
  })

  test("marks a fully settled order as paid", () => {
    expect(
      summarizeCommercialPayment({
        amountPaidMinor: 97_500,
        totalMinor: 97_500,
      }),
    ).toEqual({
      amountPaidMinor: 97_500,
      balanceDueMinor: 0,
      paymentStatus: "paid",
    })
  })

  test("preserves legacy paid orders that predate payment rows", () => {
    expect(
      effectiveCommercialAmountPaid({
        amountPaidMinor: 0,
        paymentCount: 0,
        paymentStatus: PaymentStatus.PAID,
        totalMinor: 97_500,
      }),
    ).toBe(97_500)
  })
})
