import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"

import { getCommercialOrderReportSummary } from "./commercial-orders"

describe("Commercial Order report summary", () => {
  test("counts and totals every tenant Order in one aggregate read", async () => {
    const calls: unknown[] = []
    const db = {
      commercialOrder: {
        aggregate: async (input: unknown) => {
          calls.push(input)
          return {
            _count: { _all: 147 },
            _sum: { totalMinor: 9_875_000 },
          }
        },
      },
    } as unknown as PrismaClient

    await expect(
      getCommercialOrderReportSummary(db, { tenantId: "tenant_123" }),
    ).resolves.toEqual({ orderCount: 147, orderValueMinor: 9_875_000 })
    expect(calls).toEqual([
      {
        _count: { _all: true },
        _sum: { totalMinor: true },
        where: { tenantId: "tenant_123" },
      },
    ])
  })

  test("returns zero values when the tenant has no Orders", async () => {
    const db = {
      commercialOrder: {
        aggregate: async () => ({
          _count: { _all: 0 },
          _sum: { totalMinor: null },
        }),
      },
    } as unknown as PrismaClient

    await expect(
      getCommercialOrderReportSummary(db, { tenantId: "tenant_empty" }),
    ).resolves.toEqual({ orderCount: 0, orderValueMinor: 0 })
  })

  test("keeps a Store report scoped to its tenant without a list limit", async () => {
    const calls: unknown[] = []
    const db = {
      commercialOrder: {
        aggregate: async (input: unknown) => {
          calls.push(input)
          return { _count: { _all: 147 }, _sum: { totalMinor: 9_875_000 } }
        },
      },
    } as unknown as PrismaClient

    await expect(
      getCommercialOrderReportSummary(db, {
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).resolves.toEqual({ orderCount: 147, orderValueMinor: 9_875_000 })
    expect(calls).toEqual([
      {
        _count: { _all: true },
        _sum: { totalMinor: true },
        where: { storeId: "store_123", tenantId: "tenant_123" },
      },
    ])
  })
})
