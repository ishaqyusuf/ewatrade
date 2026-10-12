import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { getBusinessCustomerDebtInTransaction } from "./customer-debt"
import {
  ITEM_SALES_PAGE_SIZE,
  getBusinessItemSalesReportInTransaction,
  itemSalesReportFromGroups,
} from "./item-sales"
import {
  getBusinessPaymentCollectionsInTransaction,
  paymentCollectionsFromGroups,
} from "./payments"
import { getBusinessStockReportInTransaction } from "./stock"
const input = {
  tenantId: "tenant",
  storeId: "store",
  createdByUserId: "rep",
  from: new Date("2026-10-10T23:00:00Z"),
  before: new Date("2026-10-11T23:00:00Z"),
  timezone: "Africa/Lagos",
  currencyCode: "NGN",
}
const group = {
  catalogItemId: "original_item",
  catalogItemName: "Original Eggs",
  variantId: "big",
  variantName: "Big",
  offeringId: "crate",
  offeringName: "Crate",
  inventoryUnitId: "crate",
  inventoryUnitName: "Crate",
  configurationVersionId: "v1",
  quantity: "9999999999999999999999.000001",
  valueMinor: "9007199254740993",
  lineCount: 147n,
  sortKey: "original_group",
}
describe("G01 authoritative source reporting", () => {
  test("item groups retain exact decimals and original names/units/configuration", () => {
    const report = itemSalesReportFromGroups(
      [
        group,
        {
          ...group,
          inventoryUnitId: "piece",
          inventoryUnitName: "Piece",
          configurationVersionId: "v2",
          quantity: "0.5",
        },
      ],
      { groupCount: "2", lineCount: "294", valueMinor: "18014398509481986" },
      input,
    )
    expect(report.complete).toBe(true)
    expect(report.rows).toHaveLength(2)
    expect(report.rows[0]?.value).toBe(`${group.quantity} Crate`)
    expect(report.rows[0]?.moneyDetails?.[0]?.amountMinor).toBe(
      group.valueMinor,
    )
    expect(report.rows[0]?.target).toEqual({
      kind: "catalog_item",
      id: "original_item",
    })
    expect(report.rows[1]?.detail).toContain("configuration v2")
  })
  test("full aggregate covers 147 groups independently of its ten-row detail page", () => {
    const report = itemSalesReportFromGroups(
      Array.from({ length: ITEM_SALES_PAGE_SIZE + 1 }, (_, i) => ({
        ...group,
        sortKey: `group_${i}`,
      })),
      {
        groupCount: "147",
        lineCount: "1000",
        valueMinor: "9007199254740993000",
      },
      input,
    )
    expect(report.complete).toBe(true)
    expect(report.rows).toHaveLength(10)
    expect(report.summary).toContain(
      "147 original item groups; 1000 lines; booked line value 9007199254740993000",
    )
    expect(report.pagination?.nextCursor).toBeTruthy()
    expect(report.pagination?.totalRows).toBe("147")
  })
  test("item SQL applies half-open order dates, Tenant, Store, currency, rep and snapshot identity", async () => {
    let sql: Prisma.Sql | undefined
    const tx = {
      $queryRaw: async (query: Prisma.Sql) => {
        sql = query
        return [
          {
            groupCount: "1",
            lineCount: "147",
            valueMinor: group.valueMinor,
            groups: [group],
          },
        ]
      },
    } as unknown as Prisma.TransactionClient
    await getBusinessItemSalesReportInTransaction(tx, {
      ...input,
      catalogItemId: "original_item",
    })
    expect(sql?.sql).toContain('o."createdAt" >= ? AND o."createdAt" < ?')
    expect(sql?.sql).toContain('o."tenantId" = ? AND o."storeId" = ?')
    expect(sql?.sql).toContain('o."createdByUserId" = ?')
    expect(sql?.sql).toContain('s."catalogItemId" = ?')
    expect(sql?.values).toEqual([
      "tenant",
      "store",
      "NGN",
      input.from,
      input.before,
      "rep",
      "original_item",
      11,
    ])
    expect(sql?.sql).not.toContain('JOIN "CatalogItem"')
  })
  test("all payment rows aggregate, refunds subtract, customer credit never counts as money", () => {
    const report = paymentCollectionsFromGroups(
      [
        {
          method: "CASH",
          type: "PAYMENT",
          amountMinor: "9007199254740993",
          count: 147n,
        },
        { method: "CASH", type: "REFUND", amountMinor: "2", count: 1n },
        {
          method: "CUSTOMER_CREDIT",
          type: "PAYMENT",
          amountMinor: "400",
          count: 3n,
        },
        {
          method: "CUSTOMER_CREDIT",
          type: "REFUND",
          amountMinor: "50",
          count: 1n,
        },
      ],
      input,
    )
    expect(report.summary).toBe(
      "Received 9007199254740993; refunded 2; net money 9007199254740991 NGN minor units. Net customer-credit settlement 350, separately.",
    )
    expect(report.complete).toBe(true)
  })
  test("collections use recording dates even for older orders and preserve permitted order scope", async () => {
    let sql: Prisma.Sql | undefined
    const tx = {
      $queryRaw: async (query: Prisma.Sql) => {
        sql = query
        return []
      },
    } as unknown as Prisma.TransactionClient
    await getBusinessPaymentCollectionsInTransaction(tx, input)
    expect(sql?.sql).toContain('p."recordedAt" >= ? AND p."recordedAt" < ?')
    expect(sql?.sql).not.toContain('o."createdAt"')
    expect(sql?.sql).not.toContain("LIMIT")
    expect(sql?.sql).not.toContain("o.status")
    expect(sql?.values).toEqual([
      "tenant",
      "store",
      "NGN",
      input.from,
      input.before,
      "rep",
    ])
  })
  test("debt reuses canonical complete-account allocation/release totals and separates credit", async () => {
    const calls: unknown[] = []
    const tx = {
      $queryRaw: async (query: unknown) =>
        query && typeof query === "object" && "sql" in query
          ? [
              {
                accountCount: "147",
                debit: "1000",
                credit: "700",
                allocations: "600",
                releases: "100",
              },
            ]
          : [],
      membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
      customerLedgerAccount: {
        findMany: async (query: unknown) => {
          calls.push(query)
          return [
            {
              id: "account",
              lastSequence: 9n,
              customer: { id: "customer", name: "Original name" },
            },
          ]
        },
      },
      customerLedgerEntry: {
        aggregate: async ({
          where,
        }: { where: { side: string; sequence: { lte: bigint } } }) => {
          expect(where.sequence.lte).toBe(9n)
          return {
            _sum: { amountMinor: where.side === "DEBIT" ? 1000n : 700n },
          }
        },
      },
      customerLedgerAllocation: {
        aggregate: async () => ({ _sum: { amountMinor: 600n } }),
      },
      customerLedgerAllocationRelease: {
        aggregate: async () => ({ _sum: { amountMinor: 100n } }),
      },
    } as unknown as Prisma.TransactionClient
    const report = await getBusinessCustomerDebtInTransaction(tx, {
      tenantId: "tenant",
      actorUserId: "owner",
      currencyCode: "NGN",
      query: "Ada",
    })
    expect(report.summary).toContain("Debt 500; available credit 200")
    expect(report.rows[0]?.moneyDetails?.[1]?.amountMinor).toBe("300")
    expect(calls[0]).toMatchObject({
      where: { tenantId: "tenant", currencyCode: "NGN" },
      take: 11,
    })
    expect(report.scope).toContain("all Stores")
  })
})

test("G01 debt pages details while complete aggregate and active finance gate remain authoritative", async () => {
  const tx = {
    $queryRaw: async (query: unknown) =>
      query && typeof query === "object" && "sql" in query
        ? [
            {
              accountCount: "147",
              debit: "147000",
              credit: "102900",
              allocations: "88200",
              releases: "14700",
            },
          ]
        : [],
    membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
    customerLedgerAccount: {
      findMany: async () =>
        Array.from({ length: 11 }, (_, i) => ({
          id: `account_${i}`,
          lastSequence: 1n,
          customer: { id: `customer_${i}`, name: "Same name" },
        })),
    },
    customerLedgerEntry: {
      aggregate: async ({ where }: { where: { side: string } }) => ({
        _sum: { amountMinor: where.side === "DEBIT" ? 1000n : 700n },
      }),
    },
    customerLedgerAllocation: {
      aggregate: async () => ({ _sum: { amountMinor: 600n } }),
    },
    customerLedgerAllocationRelease: {
      aggregate: async () => ({ _sum: { amountMinor: 100n } }),
    },
  } as unknown as Prisma.TransactionClient
  const report = await getBusinessCustomerDebtInTransaction(tx, {
    tenantId: "tenant",
    actorUserId: "owner",
    currencyCode: "NGN",
  })
  expect(report.complete).toBe(true)
  expect(report.rows).toHaveLength(10)
  expect(report.summary).toContain("Debt 73500; available credit 29400")
  expect(report.pagination?.totalRows).toBe("147")
  expect(report.pagination?.nextCursor).toBeTruthy()
  const denied = {
    ...tx,
    membership: { findFirst: async () => null },
  } as unknown as Prisma.TransactionClient
  await expect(
    getBusinessCustomerDebtInTransaction(denied, {
      tenantId: "tenant",
      actorUserId: "revoked",
      currencyCode: "NGN",
    }),
  ).rejects.toThrow("Only active business Owners and Admins")
})

test("G01 stock overflow never enters the canonical full source read", async () => {
  let queries = 0
  const tx = {
    stockBalanceSource: {
      findMany: async (args: { take?: number }) => {
        queries++
        expect(args.take).toBe(201)
        return Array.from({ length: 201 }, (_, i) => ({ id: `${i}` }))
      },
    },
  } as unknown as Prisma.TransactionClient
  const report = await getBusinessStockReportInTransaction(tx, {
    tenantId: "tenant",
    storeId: "store",
  })
  expect(queries).toBe(1)
  expect(report.complete).toBe(false)
  expect(report.rows).toEqual([])
})

test("G01 stock reuses exact canonical conversions and keeps transit/configurations distinct", async () => {
  const source = (
    id: string,
    custodyType = "STORE",
    config = "v1",
    factor = "1",
  ) => ({
    id,
    tenantId: "tenant",
    storeId: "store",
    productId: "product",
    variantId: "variant",
    inventoryUnitId: id,
    revision: 9,
    custodyType,
    custodyReferenceId: custodyType === "TRANSIT" ? "original_transfer" : "",
    kind: "SHARED_POOL",
    onHandQuantity: "9007199254740993.125",
    reservedQuantity: "0.125",
    product: { catalogItem: { id: "original_item", name: "Original Eggs" } },
    variant: { name: "Large" },
    store: { name: "Shop" },
    inventoryUnit: {
      name: id,
      factor,
      transactionScale: 3,
      configurationVersionId: config,
    },
  })
  const data = [
    source("piece"),
    source("crate", "STORE", "v1", "24"),
    source("transit", "TRANSIT"),
    source("new_unit", "STORE", "v2"),
  ]
  const tx = {
    stockBalanceSource: {
      findMany: async ({ take, where }: { take?: number; where: unknown }) => {
        expect(where).toMatchObject({ tenantId: "tenant", storeId: "store" })
        return take ? data.map((row) => ({ id: row.id })) : data
      },
    },
  } as unknown as Prisma.TransactionClient
  const report = await getBusinessStockReportInTransaction(tx, {
    tenantId: "tenant",
    storeId: "store",
  })
  expect(report.complete).toBe(true)
  expect(report.summary).toBe(
    "4 complete balance sources; 3 compatible groups.",
  )
  expect(report.rows[0]?.value).toBe("9007199254740993 piece available")
  expect(report.rows[2]?.value).toBe("0 transit available")
  expect(
    report.gaps.some((gap) => gap.includes("225179981368524828.125")),
  ).toBe(true)
})
