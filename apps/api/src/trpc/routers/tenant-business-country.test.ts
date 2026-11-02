import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { tenantRouter } from "./tenant"

test("business list carries each business's canonical country", async () => {
  const reads: unknown[] = []
  const caller = createCallerFactory(tenantRouter)({
    db: {
      user: { findUnique: async () => ({ ageBand: "ADULT" }) },
      membership: {
        findMany: async (args: { select: unknown }) => {
          reads.push(args.select)
          return [
            {
              role: "OWNER",
              tenant: {
                countryCode: null,
                currencyCode: "NGN",
                id: "store-country",
                name: "Ada Foods",
                slug: "ada-foods",
                stores: [{ countryCode: null }, { countryCode: "gh" }],
              },
            },
            {
              role: "MANAGER",
              tenant: {
                countryCode: null,
                currencyCode: "NGN",
                id: "no-country",
                name: "Bisi Wares",
                slug: "bisi-wares",
                stores: [],
              },
            },
          ]
        },
      },
    },
    requestHeaders: new Headers(),
    session: {
      session: { id: "session", token: "inert" },
      user: { id: "owner" },
    },
  } as never)

  expect(
    (await caller.businesses()).map((business) => [
      business.id,
      business.countryCode,
    ]),
  ).toEqual([
    ["store-country", "GH"],
    ["no-country", null],
  ])
  // Archived Stores never decide the country.
  expect(reads[0]).toMatchObject({
    tenant: {
      select: {
        countryCode: true,
        stores: { where: { status: { not: "ARCHIVED" } } },
      },
    },
  })
})
