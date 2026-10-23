import { StorefrontContent } from "@/components/storefront/storefront-content"
import { storefrontMetadata } from "@/components/storefront/storefront-metadata"
import { loadFactoryStorefront } from "@/lib/storefront-factory"
import { prisma } from "@ewatrade/db"
import { catalogQuerySchema } from "@ewatrade/storefront-contracts/resources"
import { storefrontIndexingEnabled } from "@ewatrade/storefront-runtime/seo"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { cache } from "react"

type Props = {
  searchParams: Promise<{ after?: string; category?: string; item?: string }>
}
export const dynamic = "force-dynamic"
// Metadata and page rendering share the same request-scoped safe projection.
const loadStorefront = cache(
  async (after?: string, category?: string, item?: string) => {
    if (!catalogQuerySchema.safeParse({ after, category, item }).success)
      notFound()
    const requestHeaders = await headers()
    const host = requestHeaders.get("host") ?? ""
    const result = await loadFactoryStorefront(prisma, host, {
      after,
      category,
      item,
    })
    if (item && !result.storefront?.highlightedItem) notFound()
    return result
  },
)

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { after, category, item } = await searchParams
  const { load, storefront: store } = await loadStorefront(
    after,
    category,
    item,
  )
  return load.status === "ready" && store
    ? storefrontMetadata(
        store,
        process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
        { after, category, indexable: storefrontIndexingEnabled(process.env) },
      )
    : {
        title: "Shop unavailable | ẸwáTrade",
        robots: { index: false, follow: false },
      }
}

export default async function HomePage({ searchParams }: Props) {
  const { after, category, item } = await searchParams
  const { load } = await loadStorefront(after, category, item)
  if (load.status !== "ready") notFound()
  return <StorefrontContent snapshot={load.snapshot} after={after} />
}
