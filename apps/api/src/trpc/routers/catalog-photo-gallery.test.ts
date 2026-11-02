import { expect, test } from "bun:test"
import { createCallerFactory, createTRPCRouter } from "../init"
import { catalogPhotosRouter } from "./catalog-photos"

const router = createTRPCRouter({ photos: catalogPhotosRouter })

type RawQuery = { sql: string; values: unknown[] }

/** Raw SQL is the only way the gallery commands read; record every query. */
function fixture(options: { role?: string; asset?: boolean } = {}) {
  const queries: RawQuery[] = []
  const tx = {
    $queryRaw: async (query: RawQuery) => {
      queries.push({ sql: query.sql, values: query.values })
      if (query.sql.includes('FROM "Tenant"'))
        return [{ id: "tenant", dataClassification: "LIVE" }]
      if (
        query.sql.includes('FROM "Store"') ||
        query.sql.includes('FROM "Membership"')
      )
        return [{ id: "row" }]
      if (query.sql.includes("FOR UPDATE") && options.asset)
        return [
          {
            id: "asset",
            state: "UPLOADING",
            contentDigest: "a".repeat(64),
            catalogItemId: null,
            storagePath: null,
            uploadedAt: null,
            bytesDeletedAt: null,
            galleryAddedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
          },
        ]
      return []
    },
  }
  const caller = createCallerFactory(router)({
    db: {
      $transaction: async (run: (client: never) => unknown) => run(tx as never),
    },
    session: {
      session: { id: "session", token: "inert" },
      user: { id: "actor" },
    },
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "LIVE",
        qaPurgeStartedAt: null,
      },
      membership: { id: "membership", role: options.role ?? "OWNER" },
      activeStore: { id: "lekki" },
      stores: [{ id: "lekki" }, { id: "ikeja" }],
    },
    qaSessionScope: null,
  } as never)
  return { caller, queries }
}

const galleryQuery = (queries: RawQuery[]) =>
  queries.find((query) => query.sql.includes('GROUP BY a."contentDigest"'))

test("All stores searches every managed Store of the caller's business", async () => {
  const state = fixture()
  expect(
    await state.caller.photos.gallery({ scope: "all", query: "50%_off" }),
  ).toEqual({ entries: [], nextCursor: null, categories: [] })
  const query = galleryQuery(state.queries)
  expect(query?.values).toContain("tenant")
  expect(query?.values).toContain("lekki")
  expect(query?.values).toContain("ikeja")
  // Wildcards in the search are literal.
  expect(query?.values).toContain("%50\\%\\_off%")
  expect(query?.sql).toContain('g."title" ILIKE')
  expect(query?.sql).toContain('i."name" ILIKE')
})

test("one Store and a category stay inside that Store", async () => {
  const state = fixture()
  await state.caller.photos.gallery({ storeId: "ikeja", category: "Trays" })
  const query = galleryQuery(state.queries)
  expect(query?.values).toContain("ikeja")
  expect(query?.values).not.toContain("lekki")
  expect(query?.values).toContain("Trays")
})

test("staff without Catalog management and foreign Stores read nothing", async () => {
  for (const [options, input, code] of [
    [{ role: "MEMBER" }, {}, "FORBIDDEN"],
    [{ role: "CASHIER" }, { scope: "all" as const }, "FORBIDDEN"],
    [{}, { storeId: "foreign" }, "NOT_FOUND"],
  ] as const) {
    const state = fixture(options)
    await expect(state.caller.photos.gallery(input)).rejects.toMatchObject({
      code,
    })
    expect(state.queries).toHaveLength(0)
  }
  for (const call of [
    (state: ReturnType<typeof fixture>) =>
      state.caller.photos.addToGallery({ assetId: "asset" }),
    (state: ReturnType<typeof fixture>) =>
      state.caller.photos.updateGalleryDetails({
        assetId: "asset",
        title: "Tray",
      }),
  ]) {
    const state = fixture({ role: "MEMBER" })
    await expect(call(state)).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(state.queries).toHaveLength(0)
  }
})

test("only a finished upload can go straight to My images", async () => {
  await expect(
    fixture().caller.photos.addToGallery({ assetId: "missing" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  await expect(
    fixture({ asset: true }).caller.photos.addToGallery({
      assetId: "asset",
      title: "Egg tray",
    }),
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
})

test("gallery inputs are bounded and strict", async () => {
  const { caller } = fixture()
  for (const input of [
    { limit: 61 },
    { cursor: "x".repeat(201) },
    { category: "x".repeat(41) },
    { storeIds: ["lekki"] },
  ])
    await expect(caller.photos.gallery(input as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  await expect(
    caller.photos.gallery({ cursor: "bm9wZQ" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.photos.updateGalleryDetails({
      assetId: "../asset",
      title: "Tray",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
})
