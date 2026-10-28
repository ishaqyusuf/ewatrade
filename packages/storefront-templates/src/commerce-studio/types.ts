import type { StorefrontRoute as CommerceStudioRoute } from "@ewatrade/storefront-contracts/routes"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import type { CanvasEditing } from "../canvas/render"
import type {
  StorefrontCommerceAdapter,
  StorefrontCustomerView,
} from "./commerce"

export type { StorefrontRoute as CommerceStudioRoute } from "@ewatrade/storefront-contracts/routes"
export type CommerceStudioProps = {
  snapshot: StorefrontClientSnapshot
  domain: string
  pageKey?: string
  editing?: CanvasEditing
  onPageChange?: (key: string) => void
  draftPreview?: boolean
  syncUrl?: boolean
  commerce?: StorefrontCommerceAdapter
  customer?: StorefrontCustomerView
  route?: CommerceStudioRoute
}
