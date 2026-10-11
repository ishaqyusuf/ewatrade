import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { createCommercialOrderGraphInTransaction } from "./commercial-orders"

function fixture() {
  let reads = 0
  const db = {
    commercialOrder: { findUnique: async () => null },
    store: { findFirst: async () => ({ id: "store", currencyCode: "NGN" }) },
    $queryRaw: async () => [],
    catalogAvailabilityAttestation: { findFirst: async () => ({ id: "commitment" }) },
    sellableOffering: { findFirst: async ({ where }: { where: { status: unknown } }) => {
      reads++
      if (where.status === "ACTIVE" && draftOnly) return null
      return { id: "offering", kind: "PRODUCT_UNIT", pricingPolicy: "FIXED",
        fixedPriceMinor: 100, storeAvailability: [{ isAvailable: true }] }
    } },
  } as unknown as Prisma.TransactionClient
  let draftOnly = false
  return { db, reads: () => reads, draftOnly: () => { draftOnly = true } }
}

const common = { tenantId: "tenant", storeId: "store", actorUserId: "actor",
  clientOrderId: "snapshot-order", schemaVersion: 1, fulfillNow: false }
const line = { offeringId: "offering", quantity: "1", expectedFixedPriceMinor: 100 }

test("repeated offering keeps each line's expected-price check", async () => {
  const f = fixture()
  await expect(createCommercialOrderGraphInTransaction(f.db, {
    ...common, lines: [line, { ...line, expectedFixedPriceMinor: 101 }],
  })).rejects.toMatchObject({ code: "INVALID_ORDER" })
  expect(f.reads()).toBe(1)
})

test("progressive draft snapshot cannot authorize a later ordinary sale", async () => {
  const f = fixture()
  f.draftOnly()
  await expect(createCommercialOrderGraphInTransaction(f.db, {
    ...common, lines: [{ ...line, progressiveAvailabilityAttestationId: "commitment" }, line],
  })).rejects.toMatchObject({ code: "OFFERING_UNAVAILABLE" })
  expect(f.reads()).toBe(2)
})
