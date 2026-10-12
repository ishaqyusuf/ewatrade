import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { createCommercialOrderGraphInTransaction } from "./commercial-orders"

function fixture() {
  let reads = 0
  const db = {
    commercialOrder: { findUnique: async () => null },
    store: { findFirst: async () => ({ id: "store", currencyCode: "NGN" }) },
    $queryRaw: async () => [],
    catalogAvailabilityAttestation: {
      findFirst: async () => ({ id: "commitment" }),
    },
    sellableOffering: {
      findMany: async ({
        where,
      }: { where: { status: unknown; id: { in: string[] } } }) => {
        reads++
        if (where.status === "ACTIVE" && draftOnly) return []
        return where.id.in
          .filter((id) => id !== "missing")
          .map((id) => ({
            id,
            kind: "PRODUCT_UNIT",
            pricingPolicy: "FIXED",
            fixedPriceMinor: 100,
            storeAvailability: [{ isAvailable: true }],
          }))
      },
    },
  } as unknown as Prisma.TransactionClient
  let draftOnly = false
  return {
    db,
    reads: () => reads,
    draftOnly: () => {
      draftOnly = true
    },
  }
}

const common = {
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  clientOrderId: "snapshot-order",
  schemaVersion: 1,
  fulfillNow: false,
}
const line = {
  offeringId: "offering",
  quantity: "1",
  expectedFixedPriceMinor: 100,
}

test("repeated offering keeps each line's expected-price check", async () => {
  const f = fixture()
  await expect(
    createCommercialOrderGraphInTransaction(f.db, {
      ...common,
      lines: [line, { ...line, expectedFixedPriceMinor: 101 }],
    }),
  ).rejects.toMatchObject({ code: "INVALID_ORDER" })
  expect(f.reads()).toBe(1)
})

test("progressive draft snapshot cannot authorize a later ordinary sale", async () => {
  const f = fixture()
  f.draftOnly()
  await expect(
    createCommercialOrderGraphInTransaction(f.db, {
      ...common,
      lines: [
        { ...line, progressiveAvailabilityAttestationId: "commitment" },
        line,
      ],
    }),
  ).rejects.toMatchObject({ code: "OFFERING_UNAVAILABLE" })
  expect(f.reads()).toBe(2)
})

test("distinct Offering lines batch while a later price still fails before writes", async () => {
  const f = fixture()
  await expect(
    createCommercialOrderGraphInTransaction(f.db, {
      ...common,
      lines: [
        line,
        { ...line, offeringId: "second", expectedFixedPriceMinor: 101 },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_ORDER" })
  expect(f.reads()).toBe(1)
})

test("an invalid first price wins over a later missing Offering", async () => {
  const f = fixture()
  await expect(
    createCommercialOrderGraphInTransaction(f.db, {
      ...common,
      lines: [
        { ...line, expectedFixedPriceMinor: 101 },
        { ...line, offeringId: "missing" },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_ORDER" })
  expect(f.reads()).toBe(1)
})

test("missing later Offering still refuses at its line", async () => {
  const f = fixture()
  await expect(
    createCommercialOrderGraphInTransaction(f.db, {
      ...common,
      lines: [line, { ...line, offeringId: "missing" }],
    }),
  ).rejects.toMatchObject({ code: "OFFERING_UNAVAILABLE" })
  expect(f.reads()).toBe(1)
})

test("invalid custom line before catalog lines refuses without reading the batch", async () => {
  const f = fixture()
  await expect(
    createCommercialOrderGraphInTransaction(f.db, {
      ...common,
      lines: [{ custom: "quick_sale", amountMinor: 0 }, line],
    }),
  ).rejects.toMatchObject({ code: "INVALID_ORDER" })
  expect(f.reads()).toBe(0)
})

test("progressive attestations remain per line even for repeated Offering IDs", async () => {
  const f = fixture()
  let attestations = 0
  f.db.catalogAvailabilityAttestation.findFirst = (async () =>
    ++attestations === 1
      ? { id: "commitment" }
      : null) as typeof f.db.catalogAvailabilityAttestation.findFirst
  const progressive = {
    ...line,
    progressiveAvailabilityAttestationId: "commitment",
  }
  await expect(
    createCommercialOrderGraphInTransaction(f.db, {
      ...common,
      lines: [progressive, { ...progressive, quantity: "2" }],
    }),
  ).rejects.toMatchObject({ code: "OFFERING_UNAVAILABLE" })
  expect(f.reads()).toBe(1)
  expect(attestations).toBe(2)
})
