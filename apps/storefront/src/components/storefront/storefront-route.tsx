import { StorefrontContent } from "@/components/storefront/storefront-content"
import { storefrontMetadata } from "@/components/storefront/storefront-metadata"
import {
  customerView,
  loadCustomerSession,
  loadStorefrontPage,
} from "@/lib/storefront-pages"
import type { CatalogQuery } from "@ewatrade/storefront-contracts/resources"
import { storefrontIndexingEnabled } from "@ewatrade/storefront-runtime/seo"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

export type StorefrontSearch = Promise<CatalogQuery>

/** A template page declared at this path (e.g. /shop, /services), with the same loader as Home. */
export async function storefrontPageMetadata(
  pageKey: string,
  searchParams: StorefrontSearch,
): Promise<Metadata> {
  const { after, category, item, q, availability, sort } = await searchParams
  const { load, storefront } = await loadStorefrontPage(
    after,
    category,
    item,
    q,
    availability,
    sort,
  )
  if (load.status !== "ready" || !storefront)
    return {
      title: "Shop unavailable | ẸwáTrade",
      robots: { index: false, follow: false },
    }
  const base = storefrontMetadata(
    storefront,
    process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
    {
      after,
      category,
      q,
      availability,
      sort,
      indexable: storefrontIndexingEnabled(process.env),
    },
  )
  const label =
    pageKey === "shop" ? "Shop" : pageKey === "services" ? "Services" : null
  return label && !item
    ? { ...base, title: `${label} | ${storefront.name}` }
    : base
}

export async function StorefrontTemplatePage({
  pageKey,
  searchParams,
}: {
  pageKey: string
  searchParams: StorefrontSearch
}) {
  const { after, category, item, q, availability, sort } = await searchParams
  const { load } = await loadStorefrontPage(
    after,
    category,
    item,
    q,
    availability,
    sort,
  )
  if (
    load.status !== "ready" ||
    !load.snapshot.composition.pages.some((page) => page.key === pageKey) ||
    !load.manifest.pages.some((page) => page.key === pageKey)
  )
    notFound()
  const session = await loadCustomerSession()
  return (
    <StorefrontContent
      snapshot={load.snapshot}
      after={after}
      pageKey={pageKey}
      customer={customerView(session)}
      route={{ kind: "page" }}
    />
  )
}
