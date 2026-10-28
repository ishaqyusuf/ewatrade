import { StorefrontLoading } from "@/components/storefront/storefront-loading"
import { StorefrontShell } from "@/components/storefront/storefront-shell"
import { commerceAdapter } from "@/lib/storefront-commerce-adapter"
import {
  customerView,
  loadCustomerSession,
  loadStorefrontPage,
} from "@/lib/storefront-pages"
import { storefrontPresentation } from "@/lib/storefront-presentation"
import "@ewatrade/storefront-templates/styles.css"
import { notFound } from "next/navigation"
import { type ReactNode, Suspense } from "react"

async function PublishedStorefront({ children }: { children: ReactNode }) {
  const { load } = await loadStorefrontPage()
  if (load.status !== "ready") notFound()
  const customer = load.snapshot.resources.commerce
    ? customerView(await loadCustomerSession())
    : null
  return (
    <StorefrontShell
      data={storefrontPresentation(load.snapshot, customer)}
      adapter={commerceAdapter}
    >
      {children}
    </StorefrontShell>
  )
}

export default function StorefrontLayout({
  children,
}: { children: ReactNode }) {
  return (
    <Suspense fallback={<StorefrontLoading label="storefront" />}>
      <PublishedStorefront>{children}</PublishedStorefront>
    </Suspense>
  )
}
