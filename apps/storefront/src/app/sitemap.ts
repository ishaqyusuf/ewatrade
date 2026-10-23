import { loadStorefrontSitemap } from "@/lib/storefront-discovery"
import type { MetadataRoute } from "next"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return loadStorefrontSitemap((await headers()).get("host") ?? "")
}
