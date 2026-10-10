import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { listCatalogLowStockPage } from "./catalog-low-stock"

function fixture(
  rows: Array<{
    id: string
    onHand?: string
    reserved?: string
    factor?: string
  }>,
) {
  let candidateQuery: unknown
  const db = {
    sellableOffering: {
      findMany: async (query: unknown) => {
        candidateQuery = query
        return rows.map(({ id }) => ({
          id,
          name: id,
          catalogItem: { id: "product", name: "Eggs" },
          variant: { name: "Large" },
          productUnitOffering: { inventoryUnit: { name: "Crate" } },
        }))
      },
      findFirst: async ({ where }: { where: { id: string } }) => {
        const row = rows.find((row) => row.id === where.id)
        if (!row) throw new Error("Missing fixture")
        const canonical = { id: row.id, stockBehavior: "CANONICAL_SHARED" }
        return {
          id: row.id,
          variantId: row.id,
          storeAvailability: [{ isAvailable: true }],
          productUnitOffering: {
            inventoryUnit: {
              factor: row.factor ?? "1",
              transactionScale: 0,
              stockBehavior: "ALTERNATE_TRANSACTION",
              configurationVersion: {
                id: "config",
                status: "CURRENT",
                units: [canonical],
                product: {
                  id: "product",
                  currentUnitConfigurationVersionId: "config",
                },
              },
            },
          },
        }
      },
    },
    stockBalanceSource: {
      findUnique: async ({
        where,
      }: {
        where: {
          storeId_variantId_inventoryUnitId_custodyType_custodyReferenceId: {
            variantId: string
          }
        }
      }) => {
        const row = rows.find(
          (row) =>
            row.id ===
            where
              .storeId_variantId_inventoryUnitId_custodyType_custodyReferenceId
              .variantId,
        )
        if (!row) throw new Error("Missing fixture")
        return row.onHand === undefined
          ? null
          : {
              id: row.id,
              tenantId: "tenant",
              revision: 1,
              onHandQuantity: row.onHand,
              reservedQuantity: row.reserved ?? "0",
            }
      },
    },
  } as unknown as PrismaClient
  return { db, query: () => candidateQuery }
}
const scope = { tenantId: "tenant", storeId: "store", threshold: "2" }

test("low stock subtracts reservations, floors shared units, includes equality and distinguishes missing stock", async () => {
  const { db } = fixture([
    { id: "a", onHand: "72", reserved: "1", factor: "24" },
    { id: "b", onHand: "0" },
    { id: "c" },
    { id: "d", onHand: "3" },
  ])
  const result = await listCatalogLowStockPage(db, scope)
  expect(
    result.lowStock.map((row) => [
      row.offeringId,
      "availableOfferingQuantity" in row ? row.availableOfferingQuantity : null,
    ]),
  ).toEqual([
    ["a", "2"],
    ["b", "0"],
  ])
  expect(result.unavailable.map((row) => row.offeringId)).toEqual(["c"])
  expect(result.hasMore).toBe(false)
  expect(result.scannedCount).toBe(4)
})

test("an empty matching page advances by the scanned candidate with tenant/store filters", async () => {
  const { db, query } = fixture([
    { id: "b", onHand: "10" },
    { id: "c", onHand: "1" },
  ])
  const result = await listCatalogLowStockPage(db, {
    ...scope,
    afterOfferingId: "a",
    limit: 1,
  })
  expect(result.lowStock).toEqual([])
  expect(result.nextCursor).toBe("b")
  expect(result.hasMore).toBe(true)
  expect(query()).toMatchObject({
    take: 2,
    where: {
      tenantId: "tenant",
      id: { gt: "a" },
      storeAvailability: { some: { storeId: "store", isAvailable: true } },
    },
  })
})

test("bad inputs and unexpected database failures cannot become empty or zero stock", async () => {
  const { db } = fixture([{ id: "a", onHand: "0" }])
  for (const threshold of ["-1", "NaN", "0.0000001"])
    await expect(
      listCatalogLowStockPage(db, { ...scope, threshold }),
    ).rejects.toThrow()
  await expect(
    listCatalogLowStockPage(db, { ...scope, limit: 21 }),
  ).rejects.toThrow()
  db.stockBalanceSource.findUnique = async () => {
    throw new Error("connection lost")
  }
  await expect(listCatalogLowStockPage(db, scope)).rejects.toThrow(
    "connection lost",
  )
})
