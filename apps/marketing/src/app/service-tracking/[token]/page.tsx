import { redirect } from "next/navigation"

export default async function ServiceTrackingLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const storefront = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? process.env.STOREFRONT_URL ?? "https://store.ewatrade.com"
  redirect(`${storefront.replace(/\/$/, "")}/service-tracking/${encodeURIComponent(token)}`)
}
