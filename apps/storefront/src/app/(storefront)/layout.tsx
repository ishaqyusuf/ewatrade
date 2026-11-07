import { StorefrontShell } from "@/components/storefront/storefront-shell"
import { commerceAdapter } from "@/lib/storefront-commerce-adapter"
import {
  customerView,
  loadCustomerSession,
  loadStorefrontFrame,
} from "@/lib/storefront-pages"
import { storefrontPresentation } from "@/lib/storefront-presentation"
import "@ewatrade/storefront-templates/styles.css"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"

export default async function StorefrontLayout({
  children,
}: { children: ReactNode }) {
  // Resolve publication before the route's loading boundary can stream HTTP 200.
  const { load } = await loadStorefrontFrame("shell")
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
