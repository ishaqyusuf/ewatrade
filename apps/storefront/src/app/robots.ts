import { loadFactoryStorefront } from "@/lib/storefront-factory"
import { prisma } from "@ewatrade/db"
import { storefrontUrl } from "@ewatrade/storefront-runtime/links"
import { storefrontIndexingEnabled } from "@ewatrade/storefront-runtime/seo"
import type { MetadataRoute } from "next"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!storefrontIndexingEnabled(process.env))
    return { rules: { userAgent: "*", disallow: "/" } }
  const { load, storefront } = await loadFactoryStorefront(
    prisma,
    (await headers()).get("host") ?? "",
  )
  if (
    load.status !== "ready" ||
    load.scope.mode !== "live" ||
    !storefront ||
    storefront.isQaPreview
  )
    return { rules: { userAgent: "*", disallow: "/" } }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: new URL(
      "/sitemap.xml",
      storefrontUrl(
        storefront.slug,
        process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
      ),
    ).toString(),
  }
}
