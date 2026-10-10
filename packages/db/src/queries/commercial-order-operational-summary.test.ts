import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getCommercialOrderOperationalSummary } from "./commercial-order-operational-summary"

test("aggregate counts retain integers beyond JavaScript's safe range", async () => {
  const db = {
    $queryRaw: async () => [
      {
        currencyCode: "NGN",
        orderCount: "9007199254740993",
        orderValueMinor: "9007199254740993123",
        outstandingCount: "9007199254740993",
        outstandingMinor: "9007199254740993123",
      },
      {
        currencyCode: "USD",
        orderCount: "1",
        orderValueMinor: "4",
        outstandingCount: "1",
        outstandingMinor: "4",
      },
    ],
  } as unknown as PrismaClient
  const result = await getCommercialOrderOperationalSummary(db, {
    tenantId: "tenant",
    storeId: "store",
  })
  expect(result.orderCount).toBe("9007199254740994")
  expect(result.outstandingCount).toBe("9007199254740994")
  expect(result.currencies[0]?.outstandingMinor).toBe("9007199254740993123")
})
test("invalid and reversed windows reject before accessing the database", async () => {
  const db = {
    $queryRaw: () => {
      throw Error("Database called")
    },
  } as unknown as PrismaClient
  for (const createdAfter of [
    new Date("invalid"),
    new Date("2026-01-02"),
    new Date("2026-01-03"),
  ])
    await expect(
      getCommercialOrderOperationalSummary(db, {
        tenantId: "tenant",
        createdAfter,
        createdBefore: new Date("2026-01-02"),
      }),
    ).rejects.toThrow("End must follow start")
})
