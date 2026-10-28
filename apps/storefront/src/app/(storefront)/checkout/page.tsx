import { StorefrontContent } from "@/components/storefront/storefront-content"
import {
  customerView,
  loadCustomerSession,
  loadStorefrontFrame,
} from "@/lib/storefront-pages"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { storefront } = await loadStorefrontFrame("checkout")
  return {
    title: storefront
      ? `Send your order request | ${storefront.name}`
      : "Checkout",
    robots: { index: false, follow: false },
  }
}

/** Domain-owned route: only templates that take order requests render it. */
export default async function CheckoutPage() {
  const { load } = await loadStorefrontFrame("checkout")
  if (load.status !== "ready" || !load.snapshot.resources.commerce) notFound()
  const session = await loadCustomerSession()
  return (
    <StorefrontContent
      snapshot={load.snapshot}
      pageKey="shop"
      customer={customerView(session)}
      route={{ kind: "checkout" }}
    />
  )
}
