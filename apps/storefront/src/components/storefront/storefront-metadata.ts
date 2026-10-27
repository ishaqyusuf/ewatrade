import type { CatalogQuery } from "@ewatrade/storefront-contracts/resources"
import { storefrontUrl } from "@ewatrade/storefront-runtime/links"
import { formatStorefrontPrice } from "@ewatrade/storefront-runtime/presentation"
import { storefrontPageUrl } from "@ewatrade/storefront-runtime/seo"
import type { Metadata } from "next"
import type { PublicStorefront, PublicStorefrontItem } from "./storefront-types"

export function storefrontShareDescription(
  store: PublicStorefront,
  item?: PublicStorefrontItem | null,
) {
  const price =
    item?.priceMinor != null
      ? `${item.isFromPrice ? "From " : ""}${formatStorefrontPrice(item.priceMinor, item.currencyCode)}`
      : null
  return (
    [price, item ? item.description : store.description]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 240) ||
    (item
      ? `Discover ${item.name} at ${store.name}.`
      : `Browse products and services from ${store.name}.`)
  )
}

export function storefrontMetadata(
  store: PublicStorefront,
  platformDomain: string,
  query: {
    page?: "home" | "about"
    after?: string
    category?: string | null
    indexable?: boolean
    q?: string
    availability?: CatalogQuery["availability"]
    sort?: CatalogQuery["sort"]
  } = {},
): Metadata {
  const item = query.page === "about" ? null : store.highlightedItem
  const url = storefrontPageUrl(store, platformDomain, {
    ...query,
    item: item?.id,
  })
  const image = new URL(
    "/share-image",
    storefrontUrl(store.slug, platformDomain),
  )
  if (item) image.searchParams.set("item", item.id)
  const title =
    query.page === "about"
      ? `About ${store.name}`
      : item
        ? `${item.name} | ${store.name}`
        : `${store.name} | ẸwáTrade`
  const description = storefrontShareDescription(store, item)
  const images = [
    {
      url: image.toString(),
      width: 1200,
      height: 630,
      alt: item ? `${item.name} — ${store.name}` : store.name,
      type: "image/png",
    },
  ]
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: store.name,
      title,
      description,
      url,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((image) => image.url),
    },
    robots:
      store.isQaPreview ||
      query.indexable === false ||
      (!item && !!(query.q?.trim() || query.availability || query.sort))
        ? { index: false, follow: false }
        : { index: true, follow: true },
  }
}
