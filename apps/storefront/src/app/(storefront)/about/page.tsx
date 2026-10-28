import { StorefrontContent } from "@/components/storefront/storefront-content"
import { storefrontMetadata } from "@/components/storefront/storefront-metadata"
import {
  customerView,
  loadCustomerSession,
  loadStorefrontPage as loadPage,
} from "@/lib/storefront-pages"
import { storefrontIndexingEnabled } from "@ewatrade/storefront-runtime/seo"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"
export async function generateMetadata() {
  const { load, storefront } = await loadPage()
  return load.status === "ready" && storefront
    ? storefrontMetadata(
        storefront,
        process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
        { page: "about", indexable: storefrontIndexingEnabled(process.env) },
      )
    : {
        title: "Storefront unavailable",
        robots: { index: false, follow: false },
      }
}
export default async function AboutPage() {
  const { load } = await loadPage()
  if (
    load.status !== "ready" ||
    !load.snapshot.composition.pages.some((page) => page.key === "about") ||
    !load.manifest.pages.some(
      (page) => page.key === "about" && page.path === "/about",
    )
  )
    notFound()
  const customer = load.snapshot.resources.commerce
    ? customerView(await loadCustomerSession())
    : undefined
  return (
    <StorefrontContent
      snapshot={load.snapshot}
      pageKey="about"
      customer={customer}
    />
  )
}
