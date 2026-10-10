import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { updateCatalogPriceInTransaction } from "./catalog-price-update"

const input = {
  tenantId: "tenant",
  offeringId: "eggs-big-piece",
  expectedRevision: 3,
  priceMinor: 25_000,
  actorUserId: "owner",
  reason: "Supplier price changed",
}

function fixture(
  options: {
    missing?: boolean
    stale?: boolean
    race?: boolean
    historyFailure?: boolean
  } = {},
) {
  const writes: unknown[] = []
  const history: unknown[] = []
  const db = {
    sellableOffering: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        expect(where).toMatchObject({
          id: input.offeringId,
          tenantId: input.tenantId,
          status: "ACTIVE",
          kind: "PRODUCT_UNIT",
          pricingPolicy: "FIXED",
          catalogItem: { kind: "PRODUCT", status: "ACTIVE" },
          variant: { status: "ACTIVE" },
        })
        return options.missing
          ? null
          : {
              id: input.offeringId,
              catalogItemId: "eggs",
              name: "Big · Piece",
              revision: options.stale ? 4 : 3,
              fixedPriceMinor: 20_000,
              currencyCode: "NGN",
            }
      },
      updateMany: async (args: unknown) => {
        writes.push(args)
        return { count: options.race ? 0 : 1 }
      },
    },
    catalogPriceChange: {
      create: async (args: unknown) => {
        if (options.historyFailure) throw Error("History storage failed")
        history.push(args)
        return { id: "price-change" }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { db, writes, history }
}

test("updates one offering with revision protection and attributable price history", async () => {
  const { db, writes, history } = fixture()
  const result = await updateCatalogPriceInTransaction(db, input)
  expect(result).toMatchObject({
    previousPriceMinor: 20_000,
    priceMinor: 25_000,
    revision: 4,
    catalogItemId: "eggs",
    priceChangeId: "price-change",
  })
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    where: {
      id: input.offeringId,
      tenantId: "tenant",
      revision: 3,
      fixedPriceMinor: 20_000,
    },
    data: { fixedPriceMinor: 25_000, revision: { increment: 1 } },
  })
  expect(history).toEqual([
    {
      data: {
        tenantId: "tenant",
        offeringId: input.offeringId,
        previousPriceMinor: 20_000,
        priceMinor: 25_000,
        currencyCode: "NGN",
        changedByUserId: "owner",
        reason: input.reason,
      },
      select: { id: true },
    },
  ])
})

test("missing and stale offerings cannot write a price or history", async () => {
  for (const options of [{ missing: true }, { stale: true }, { race: true }]) {
    const { db, writes, history } = fixture(options)
    await expect(
      updateCatalogPriceInTransaction(db, input),
    ).rejects.toMatchObject({
      code: options.missing
        ? "CATALOG_OFFERING_NOT_FOUND"
        : "REVISION_CONFLICT",
    })
    expect(history).toHaveLength(0)
    if (!options.race) expect(writes).toHaveLength(0)
  }
})

test("accepts an explicit zero price, rejects no-op and invalid amounts", async () => {
  const zero = fixture()
  expect(
    (
      await updateCatalogPriceInTransaction(zero.db, {
        ...input,
        priceMinor: 0,
      })
    ).priceMinor,
  ).toBe(0)
  for (const priceMinor of [20_000, -1, 1.5, Number.NaN, 100_000_001]) {
    const { db, writes, history } = fixture()
    await expect(
      updateCatalogPriceInTransaction(db, { ...input, priceMinor }),
    ).rejects.toMatchObject({ code: "INVALID_OFFERING" })
    expect(writes).toHaveLength(0)
    expect(history).toHaveLength(0)
  }
})

test("history failure propagates so the caller rolls back the price change", async () => {
  const { db } = fixture({ historyFailure: true })
  await expect(updateCatalogPriceInTransaction(db, input)).rejects.toThrow(
    "History storage failed",
  )
})
