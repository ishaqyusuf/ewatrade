import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { findInventoryOpeningOwnerInTransaction } from "./inventory-opening-owner"

const input = {
  tenantId: "tenant",
  storeId: "store",
  catalogItemIds: ["catalog"],
  payloadHash: "a".repeat(64),
  source: "catalog_setup",
  clientOperationId: "request:with:namespace:opening-stock:variant:with:colon",
}
const receipt = {
  id: "receipt",
  tenantId: "tenant",
  storeId: "store",
  catalogItemId: "catalog",
  payloadHash: input.payloadHash,
  commandType: "CREATE_CATALOG_ITEM",
  clientOperationId: "request:with:namespace",
}

function fixture(rows = [receipt]) {
  let reads = 0
  const tx = {
    catalogCommandReceipt: {
      findMany: async ({ where, take }: { where: unknown; take: number }) => {
        reads++
        expect(where).toMatchObject({
          tenantId: "tenant",
          storeId: "store",
          catalogItemId: "catalog",
          payloadHash: input.payloadHash,
        })
        expect(take).toBe(2)
        return rows
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, reads: () => reads }
}

test("receipt ownership tolerates namespaced commands and variant keys without monetary authority", async () => {
  const f = fixture()
  expect(await findInventoryOpeningOwnerInTransaction(f.tx, input)).toEqual(
    receipt,
  )
  const grad = fixture([
    { ...receipt, commandType: "GRADUATE_CATALOG_OFFERING" },
  ])
  expect(
    await findInventoryOpeningOwnerInTransaction(grad.tx, {
      ...input,
      source: "service_commerce_catalog_graduation",
      clientOperationId: "request:with:namespace:opening-stock",
    }),
  ).toMatchObject({ id: "receipt" })
})

test("foreign scope, hash, action and reserved command namespace do not establish ownership", async () => {
  for (const override of [
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { catalogItemId: "foreign" },
    { payloadHash: "b".repeat(64) },
    { commandType: "PUBLISH_CATALOG_OFFERING" },
    { clientOperationId: "different-command" },
  ]) {
    const f = fixture([{ ...receipt, ...override }])
    expect(await findInventoryOpeningOwnerInTransaction(f.tx, input)).toBeNull()
  }
  for (const clientOperationId of [
    "request:with:namespace:opening-stock",
    "request:with:namespace:opening-stock:",
    "request:with:namespace:opening-stockish:variant",
  ])
    expect(
      await findInventoryOpeningOwnerInTransaction(fixture().tx, {
        ...input,
        clientOperationId,
      }),
    ).toBeNull()
  expect(
    await findInventoryOpeningOwnerInTransaction(
      fixture([{ ...receipt, commandType: "GRADUATE_CATALOG_OFFERING" }]).tx,
      { ...input, source: "service_commerce_catalog_graduation" },
    ),
  ).toBeNull()
})

test("unowned ordinary operations stay unowned; mixed and ambiguous opening receipts fail closed", async () => {
  const f = fixture()
  expect(
    await findInventoryOpeningOwnerInTransaction(f.tx, {
      ...input,
      source: "inventory",
    }),
  ).toBeNull()
  expect(
    await findInventoryOpeningOwnerInTransaction(f.tx, {
      ...input,
      catalogItemIds: [],
    }),
  ).toBeNull()
  expect(f.reads()).toBe(0)
  await expect(
    findInventoryOpeningOwnerInTransaction(f.tx, {
      ...input,
      catalogItemIds: ["catalog", "foreign"],
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(
    findInventoryOpeningOwnerInTransaction(
      fixture([receipt, receipt]).tx,
      input,
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(
    await findInventoryOpeningOwnerInTransaction(fixture([]).tx, input),
  ).toBeNull()
})
