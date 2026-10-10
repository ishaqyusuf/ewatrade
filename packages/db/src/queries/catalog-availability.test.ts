import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { setCatalogOfferingStoreAvailabilityInTransaction } from "./catalog"

const saved = { isAvailable: true, updatedAt: new Date("2026-10-01T00:00:00Z") }
function fixture(current: typeof saved | null = saved) {
  const writes: unknown[] = []
  const tx = {
    $transaction: () => {
      throw Error("Nested transaction")
    },
    $queryRaw: async () => [{ id: "offering" }],
    sellableOffering: { findFirst: async () => ({ id: "offering" }) },
    store: { findFirst: async () => ({ id: "store" }) },
    storeOfferingAvailability: {
      findUnique: async () => current,
      upsert: async (input: unknown) => {
        writes.push(input)
        return { isAvailable: false }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, writes }
}
const command = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  offeringId: "offering",
  isAvailable: false,
}
test("availability composes in caller transaction and only writes the exact Store/offering", async () => {
  const { tx, writes } = fixture()
  await setCatalogOfferingStoreAvailabilityInTransaction(tx, {
    ...command,
    expectedAvailability: saved,
  })
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    where: { storeId_offeringId: { storeId: "store", offeringId: "offering" } },
    update: { isAvailable: false },
  })
})
test("stale value, stale revision and newly created availability reject before writing", async () => {
  for (const expectedAvailability of [
    null,
    { ...saved, isAvailable: false },
    { ...saved, updatedAt: new Date(0) },
  ]) {
    const { tx, writes } = fixture()
    await expect(
      setCatalogOfferingStoreAvailabilityInTransaction(tx, {
        ...command,
        expectedAvailability,
      }),
    ).rejects.toThrow("changed")
    expect(writes).toEqual([])
  }
})
test("reviewed absence can create an explicit unavailable Store row", async () => {
  const { tx, writes } = fixture(null)
  await setCatalogOfferingStoreAvailabilityInTransaction(tx, {
    ...command,
    expectedAvailability: null,
  })
  expect(writes[0]).toMatchObject({
    create: { isAvailable: false, storeId: "store", offeringId: "offering" },
  })
})
