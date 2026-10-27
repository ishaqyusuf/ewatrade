import type {
  CatalogQuery,
  PublicCatalogItem,
} from "@ewatrade/storefront-contracts/resources"
import { storefrontUrl } from "./links"

export type StorefrontSeoStore = {
  name: string
  slug: string
  description: string | null
  isQaPreview: boolean
  items: PublicCatalogItem[]
  highlightedItem: PublicCatalogItem | null
  nextCursor: string | null
}

export function storefrontIndexingEnabled(env: {
  APP_ENV?: string
  NODE_ENV?: string
  VERCEL_ENV?: string
}) {
  return (
    env.APP_ENV === "production" &&
    env.NODE_ENV === "production" &&
    (!env.VERCEL_ENV || env.VERCEL_ENV === "production")
  )
}

/** Stable platform address remains preferred; verified custom hosts are aliases. */
export function storefrontPageUrl(
  store: Pick<StorefrontSeoStore, "slug">,
  platformDomain: string,
  query: {
    page?: "home" | "about"
    category?: string | null
    after?: string
    item?: string
    q?: string
    availability?: CatalogQuery["availability"]
    sort?: CatalogQuery["sort"]
  } = {},
) {
  const url = new URL(storefrontUrl(store.slug, platformDomain, query.item))
  if (query.page === "about") {
    url.pathname = "/about"
    url.search = ""
  } else if (!query.item) {
    if (query.category) url.searchParams.set("category", query.category)
    if (query.after) url.searchParams.set("after", query.after)
    if (query.q?.trim()) url.searchParams.set("q", query.q.trim())
    if (query.availability)
      url.searchParams.set("availability", query.availability)
    if (query.sort) url.searchParams.set("sort", query.sort)
  }
  return url.toString()
}

export function storefrontStructuredData(
  store: StorefrontSeoStore,
  platformDomain: string,
  query: {
    page?: "home" | "about"
    category?: string | null
    after?: string
    q?: string
    availability?: CatalogQuery["availability"]
    sort?: CatalogQuery["sort"]
  } = {},
) {
  const home = storefrontUrl(store.slug, platformDomain)
  const item = query.page === "about" ? null : store.highlightedItem
  const url = storefrontPageUrl(store, platformDomain, {
    ...query,
    item: item?.id,
  })
  const business = {
    "@type": "Organization",
    "@id": `${home}#business`,
    name: store.name,
    url: home,
    ...(store.description ? { description: store.description } : {}),
  }
  const image = (item: PublicCatalogItem) =>
    item.photoUrl?.startsWith("https://") ? { image: item.photoUrl } : {}
  const entry = (item: PublicCatalogItem) => ({
    "@type": item.kind === "SERVICE" ? "Service" : "Product",
    "@id": `${storefrontUrl(store.slug, platformDomain, item.id)}#item`,
    name: item.name,
    url: storefrontUrl(store.slug, platformDomain, item.id),
    ...(item.description ? { description: item.description } : {}),
    ...image(item),
    ...(item.kind === "SERVICE"
      ? { provider: { "@id": business["@id"] } }
      : {}),
    ...(item.options.some((option) => option.priceMinor !== null)
      ? {
          offers: item.options
            .filter((option) => option.priceMinor !== null)
            .map((option) => ({
              "@type": "Offer",
              name: option.name,
              url: storefrontUrl(store.slug, platformDomain, item.id),
              price: ((option.priceMinor ?? 0) / 100).toFixed(2),
              priceCurrency: option.currencyCode,
              seller: { "@id": business["@id"] },
              ...(option.availability === "OUT_OF_STOCK"
                ? { availability: "https://schema.org/OutOfStock" }
                : {}),
            })),
        }
      : {}),
  })
  return {
    "@context": "https://schema.org",
    "@graph": [
      business,
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        url: home,
        name: store.name,
        publisher: { "@id": business["@id"] },
      },
      {
        "@type":
          query.page === "about"
            ? "AboutPage"
            : item
              ? "ItemPage"
              : "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: item
          ? item.name
          : query.page === "about"
            ? `About ${store.name}`
            : store.name,
        isPartOf: { "@id": `${home}#website` },
        mainEntity: item
          ? entry(item)
          : query.page === "about"
            ? { "@id": business["@id"] }
            : {
                "@type": "ItemList",
                itemListElement: store.items.map((item, index) => ({
                  "@type": "ListItem",
                  position: index + 1,
                  item: entry(item),
                })),
              },
      },
    ],
  }
}

/** Merchant text must never be able to end a JSON-LD script element. */
export const serializeStorefrontStructuredData = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c")

export type StorefrontSitemapPage = {
  store: StorefrontSeoStore
  mode: "live" | "preview"
  releaseId: string
  about: boolean
}

/** Uses exactly the public catalog pages, so plan-hidden/unpublished entries never leak. */
export async function collectStorefrontSitemap(
  platformDomain: string,
  load: (after?: string) => Promise<StorefrontSitemapPage | null>,
) {
  const first = await load()
  if (!first || first.mode !== "live" || first.store.isQaPreview) return []
  const urls = new Set([storefrontUrl(first.store.slug, platformDomain)])
  if (first.about)
    urls.add(storefrontPageUrl(first.store, platformDomain, { page: "about" }))
  const cursors = new Set<string>()
  let page = first
  for (let count = 0; count < 999; count++) {
    if (
      page.mode !== "live" ||
      page.store.isQaPreview ||
      page.releaseId !== first.releaseId ||
      page.store.slug !== first.store.slug
    )
      return []
    for (const item of page.store.items)
      urls.add(storefrontUrl(first.store.slug, platformDomain, item.id))
    const cursor = page.store.nextCursor
    if (!cursor) return [...urls].map((url) => ({ url }))
    if (cursors.has(cursor))
      throw new Error("Storefront sitemap cursor repeated")
    cursors.add(cursor)
    const next = await load(cursor)
    if (!next) return []
    page = next
  }
  // Keep within the XML protocol's 50,000 URL limit. The next listing is crawlable.
  urls.add(
    storefrontPageUrl(first.store, platformDomain, {
      after: [...cursors].at(-1),
    }),
  )
  return [...urls].map((url) => ({ url }))
}
