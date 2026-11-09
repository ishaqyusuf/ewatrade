import { expect, test } from "bun:test"
import { getCatalogProductShareSource } from "./catalog-product-share"
import type { loadLiveStorefrontForHost } from "./storefront-factory-loader"
import type { DbClient } from "./types"

type Loaded = NonNullable<Awaited<ReturnType<typeof loadLiveStorefrontForHost>>>
const scope = { tenantId: "tenant", storeId: "store", itemId: "one" }

function fixture(
  options: {
    qa?: boolean
    connections?: string[]
    /** Hosts the public loader resolves, and the Store each one serves. */
    live?: Record<string, { storeId?: string; tenantId?: string; qa?: boolean }>
  } = {},
) {
  const reads: unknown[] = []
  const loaded: string[] = []
  const db = {
    tenant: {
      findFirst: async ({ where }: { where: unknown }) => {
        reads.push(where)
        return options.qa ? null : { slug: "merchant" }
      },
    },
    domainConnection: {
      findMany: async (query: unknown) => {
        reads.push(query)
        return (options.connections ?? []).map((hostname) => ({ hostname }))
      },
    },
  } as unknown as DbClient
  const loadForHost = (async (_db: DbClient, host: string) => {
    loaded.push(host)
    const live = options.live?.[host]
    if (!live) return null
    return {
      site: {
        siteId: "site",
        storeId: live.storeId ?? "store",
        release: { tenantId: live.tenantId ?? "tenant" },
      },
      storefront: { isQaPreview: live.qa ?? false },
    } as unknown as Loaded
  }) as unknown as typeof loadLiveStorefrontForHost
  return { db, reads, loaded, loadForHost }
}

test("only a LIVE active tenant can produce a share source", async () => {
  const { db, reads, loadForHost } = fixture({
    qa: true,
    live: { "merchant.ewatrade.com": {} },
  })
  expect(await getCatalogProductShareSource(db, scope, loadForHost)).toBeNull()
  expect(reads[0]).toEqual({
    id: "tenant",
    isActive: true,
    dataClassification: "LIVE",
  })
})

test("without a custom host the platform Store subdomain is used", async () => {
  const { db, loadForHost } = fixture({
    live: { "merchant.ewatrade.com": {} },
  })
  const result = await getCatalogProductShareSource(db, scope, loadForHost)
  expect(result?.host).toBe("merchant.ewatrade.com")
})

test("unpublished Sites, QA previews and a different Site Store or tenant produce no share source", async () => {
  type Live = Record<
    string,
    { storeId?: string; tenantId?: string; qa?: boolean }
  >
  for (const live of [
    {},
    { "merchant.ewatrade.com": { qa: true } },
    { "merchant.ewatrade.com": { storeId: "other-store" } },
    { "merchant.ewatrade.com": { tenantId: "other-tenant" } },
  ] as Live[]) {
    const { db, loadForHost } = fixture({ live })
    expect(
      await getCatalogProductShareSource(db, scope, loadForHost),
    ).toBeNull()
  }
})

test("share prefers the Store's verified custom host; only active verified connections are candidates", async () => {
  const { db, reads, loaded, loadForHost } = fixture({
    connections: ["shop.merchant.ng"],
    live: { "shop.merchant.ng": {}, "merchant.ewatrade.com": {} },
  })
  const result = await getCatalogProductShareSource(db, scope, loadForHost)
  expect(result?.host).toBe("shop.merchant.ng")
  expect(loaded).toEqual(["shop.merchant.ng"])
  expect(reads[1]).toMatchObject({
    where: {
      tenantId: "tenant",
      storeId: "store",
      status: "ACTIVE",
      verifiedAt: { not: null },
      disconnectedAt: null,
    },
    orderBy: [{ isPrimary: "desc" }, { activeAt: "desc" }],
  })
})

test("a custom host the public loader does not verify falls back to the platform host", async () => {
  const { db, loaded, loadForHost } = fixture({
    connections: ["shop.merchant.ng"],
    live: { "merchant.ewatrade.com": {} },
  })
  const result = await getCatalogProductShareSource(db, scope, loadForHost)
  expect(result?.host).toBe("merchant.ewatrade.com")
  expect(loaded).toEqual(["shop.merchant.ng", "merchant.ewatrade.com"])
})

test("a custom host serving another Store never becomes this Store's share host", async () => {
  const { db, loadForHost } = fixture({
    connections: ["shop.merchant.ng"],
    live: {
      "shop.merchant.ng": { storeId: "other-store" },
      "merchant.ewatrade.com": {},
    },
  })
  const result = await getCatalogProductShareSource(db, scope, loadForHost)
  expect(result?.host).toBe("merchant.ewatrade.com")
})
