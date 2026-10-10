import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import {
  updateProductDetailsInTransaction,
  updateProductIdentifiersInTransaction,
} from "./catalog-product-update"

const updatedAt = new Date("2026-10-10T00:00:00.000Z")
const scope = { tenantId: "tenant", storeId: "store", actorUserId: "actor" }
function fixture(
  options: { stale?: boolean; race?: boolean; duplicate?: boolean } = {},
) {
  const writes: Array<{ table: string; args: unknown }> = []
  const db = {
    catalogItem: {
      findFirst: async (args: unknown) => {
        expect(args).toMatchObject({
          where: {
            id: "item",
            tenantId: "tenant",
            kind: "PRODUCT",
            status: "ACTIVE",
          },
        })
        return {
          id: "item",
          name: "Eggs",
          description: "Fresh eggs",
          category: "Food",
          updatedAt,
        }
      },
      updateMany: async (args: unknown) => {
        writes.push({ table: "item", args })
        return { count: options.race ? 0 : 1 }
      },
    },
    sellableOffering: {
      findFirst: async (args: unknown) => {
        expect(args).toMatchObject({
          where: {
            id: "offering",
            tenantId: "tenant",
            status: "ACTIVE",
            kind: "PRODUCT_UNIT",
            catalogItem: { kind: "PRODUCT", status: "ACTIVE" },
            variant: { status: "ACTIVE" },
          },
        })
        return {
          id: "offering",
          catalogItemId: "item",
          revision: options.stale ? 4 : 3,
          productUnitOffering: {
            id: "unit",
            sku: "EGG",
            barcode: null,
            updatedAt,
          },
        }
      },
      updateMany: async (args: unknown) => {
        writes.push({ table: "offering", args })
        return { count: options.race ? 0 : 1 }
      },
    },
    productUnitOffering: {
      updateMany: async (args: unknown) => {
        if (options.duplicate)
          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
          })
        writes.push({ table: "unit", args })
        return { count: 1 }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { db, writes }
}

test("product detail patch preserves omitted fields and fences the item revision", async () => {
  const { db, writes } = fixture()
  const result = await updateProductDetailsInTransaction(db, {
    ...scope,
    catalogItemId: "item",
    expectedUpdatedAt: updatedAt.toISOString(),
    name: "Large eggs",
  })
  expect(result.changes).toEqual([
    { field: "name", before: "Eggs", after: "Large eggs" },
  ])
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    table: "item",
    args: {
      where: { id: "item", tenantId: "tenant", updatedAt },
      data: { name: "Large eggs", description: undefined },
    },
  })
  expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(
    updatedAt.getTime(),
  )
})

test("clearing description/category is explicit and clears category hierarchy together", async () => {
  const { db, writes } = fixture()
  const result = await updateProductDetailsInTransaction(db, {
    ...scope,
    catalogItemId: "item",
    expectedUpdatedAt: updatedAt.toISOString(),
    description: null,
    category: null,
  })
  expect(result.changes).toHaveLength(2)
  expect(writes[0]).toMatchObject({
    args: {
      data: {
        description: null,
        category: null,
        categoryId: null,
        subcategoryId: null,
      },
    },
  })
})

test("stale, unchanged and invalid product edits refuse writes", async () => {
  const { db, writes } = fixture()
  const base = {
    ...scope,
    catalogItemId: "item",
    expectedUpdatedAt: updatedAt.toISOString(),
  }
  await expect(
    updateProductDetailsInTransaction(db, {
      ...base,
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
      name: "New",
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  await expect(
    updateProductDetailsInTransaction(db, { ...base, name: "Eggs" }),
  ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
  await expect(
    updateProductDetailsInTransaction(db, { ...base, name: " " }),
  ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
  expect(writes).toHaveLength(0)
  const race = fixture({ race: true })
  await expect(
    updateProductDetailsInTransaction(race.db, { ...base, name: "New" }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
})

test("identifiers change only the reviewed selling unit and retain omitted barcode", async () => {
  const { db, writes } = fixture()
  const result = await updateProductIdentifiersInTransaction(db, {
    tenantId: "tenant",
    offeringId: "offering",
    expectedRevision: 3,
    sku: "EGG-BIG",
  })
  expect(result).toMatchObject({
    revision: 4,
    changes: [{ field: "sku", before: "EGG", after: "EGG-BIG" }],
  })
  expect(writes).toHaveLength(2)
  expect(writes[0]).toMatchObject({
    table: "offering",
    args: {
      where: { id: "offering", revision: 3 },
      data: { revision: { increment: 1 } },
    },
  })
  expect(writes[1]).toMatchObject({
    table: "unit",
    args: {
      where: {
        id: "unit",
        tenantId: "tenant",
        offeringId: "offering",
        updatedAt,
      },
      data: { sku: "EGG-BIG", barcode: undefined },
    },
  })
})

test("stale or raced offering cannot change identifiers; duplicates propagate for rollback", async () => {
  const input = {
    tenantId: "tenant",
    offeringId: "offering",
    expectedRevision: 3,
    sku: "NEW",
  }
  for (const options of [{ stale: true }, { race: true }]) {
    const { db, writes } = fixture(options)
    await expect(
      updateProductIdentifiersInTransaction(db, input),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
    expect(writes.some((w) => w.table === "unit")).toBe(false)
  }
  const { db } = fixture({ duplicate: true })
  await expect(
    updateProductIdentifiersInTransaction(db, input),
  ).rejects.toMatchObject({ code: "DUPLICATE_CATALOG_KEY" })
})
