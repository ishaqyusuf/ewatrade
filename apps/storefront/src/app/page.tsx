import { StorefrontContent } from "@/components/storefront/storefront-content"
import { prisma } from "@ewatrade/db"
import { getPublicStorefrontForHost } from "@ewatrade/db/queries"
import { headers } from "next/headers"
import { notFound } from "next/navigation"

export default async function HomePage({
  searchParams,
}: { searchParams: Promise<{ after?: string }> }) {
  const requestHeaders = await headers()
  const { after } = await searchParams
  const store = await getPublicStorefrontForHost(
    prisma,
    requestHeaders.get("host") ?? "",
    after,
  )
  if (!store) notFound()
  return <StorefrontContent store={store} />
}
