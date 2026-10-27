import { StorefrontContent } from "@/components/storefront/storefront-content"
import { storefrontOtpAdapter } from "@/lib/storefront-commerce"
import {
  customerView,
  loadCustomerSession,
  loadStorefrontPage,
  signedInAccount,
} from "@/lib/storefront-pages"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { storefront } = await loadStorefrontPage()
  return {
    title: storefront ? `Your account | ${storefront.name}` : "Account",
    robots: { index: false, follow: false },
  }
}

type Props = { searchParams: Promise<{ next?: string }> }

export default async function AccountPage({ searchParams }: Props) {
  const { load, storefront } = await loadStorefrontPage()
  if (
    load.status !== "ready" ||
    load.snapshot.composition.template.key !== "commerce-studio"
  )
    notFound()
  const session = await loadCustomerSession()
  const { next } = await searchParams
  const adapter = load.snapshot.resources.commerce?.customerAccounts.available
    ? storefrontOtpAdapter({ qaTenant: Boolean(storefront?.isQaPreview) })
    : null
  const account = session
    ? await signedInAccount(session)
    : {
        signedIn: false as const,
        channels: adapter?.channels ?? [],
        next:
          typeof next === "string" && /^\/(?!\/)[\w\-/?=&.]{0,200}$/.test(next)
            ? next
            : null,
        testAdapter: adapter?.name === "test",
      }
  return (
    <StorefrontContent
      snapshot={load.snapshot}
      pageKey="home"
      customer={customerView(session)}
      route={{ kind: "account", account }}
    />
  )
}
