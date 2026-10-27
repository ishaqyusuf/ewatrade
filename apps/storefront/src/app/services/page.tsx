import {
  type StorefrontSearch,
  StorefrontTemplatePage,
  storefrontPageMetadata,
} from "@/components/storefront/storefront-route"

export const dynamic = "force-dynamic"
type Props = { searchParams: StorefrontSearch }

export function generateMetadata({ searchParams }: Props) {
  return storefrontPageMetadata("services", searchParams)
}
export default function ServicesPage({ searchParams }: Props) {
  return (
    <StorefrontTemplatePage pageKey="services" searchParams={searchParams} />
  )
}
