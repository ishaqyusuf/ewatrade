import { storefrontMetadata } from "@/components/storefront/storefront-metadata"
import { StorefrontTemplatePage } from "@/components/storefront/storefront-route"
import { loadStorefrontPage as loadStorefront } from "@/lib/storefront-pages"
import type { CatalogQuery } from "@ewatrade/storefront-contracts/resources"
import { storefrontIndexingEnabled } from "@ewatrade/storefront-runtime/seo"
import type { Metadata } from "next"

type Props = {
  searchParams: Promise<CatalogQuery>
}
export const dynamic = "force-dynamic"

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { after, category, item, q, availability, sort } = await searchParams
  const { load, storefront: store } = await loadStorefront(
    after,
    category,
    item,
    q,
    availability,
    sort,
  )
  return load.status === "ready" && store
    ? storefrontMetadata(
        store,
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
    : {
        title: "Shop unavailable | ẸwáTrade",
        robots: { index: false, follow: false },
      }
}

export default function HomePage({ searchParams }: Props) {
  return <StorefrontTemplatePage pageKey="home" searchParams={searchParams} />
}
