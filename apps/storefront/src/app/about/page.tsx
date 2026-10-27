import { StorefrontContent } from "@/components/storefront/storefront-content"
import { storefrontMetadata } from "@/components/storefront/storefront-metadata"
import { loadFactoryStorefront } from "@/lib/storefront-factory"
import { customerView, loadCustomerSession } from "@/lib/storefront-pages"
import { prisma } from "@ewatrade/db"
import { storefrontIndexingEnabled } from "@ewatrade/storefront-runtime/seo"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { cache } from "react"

export const dynamic = "force-dynamic"
const loadPage = cache(async () =>
  loadFactoryStorefront(prisma, (await headers()).get("host") ?? ""),
)
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
  const customer =
    load.snapshot.composition.template.key === "commerce-studio"
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
