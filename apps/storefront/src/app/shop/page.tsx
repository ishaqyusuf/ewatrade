import {
  type StorefrontSearch,
  StorefrontTemplatePage,
  storefrontPageMetadata,
} from "@/components/storefront/storefront-route"

export const dynamic = "force-dynamic"
type Props = { searchParams: StorefrontSearch }

export function generateMetadata({ searchParams }: Props) {
  return storefrontPageMetadata("shop", searchParams)
}
export default function ShopPage({ searchParams }: Props) {
  return <StorefrontTemplatePage pageKey="shop" searchParams={searchParams} />
}
