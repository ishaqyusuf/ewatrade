import type { ReactNode } from "react"
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native"

export type CatalogKindFilter = "all" | "product" | "service"
export type CatalogRow = {
  detail: string
  availabilityLabel: string
  id: string
  kind: "product" | "service"
  name: string
  priceLabel: string
  unitName: string
}
export type CatalogItemsContentProps = {
  designScreen?: "catalog" | "catalog-picker"
  dockHidden?: boolean
  onAddItem: () => void
  onAddProduct?: () => void
  onAddService?: () => void
  onComplete?: () => void
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  presentation?: "modal" | "tab"
}
export type CatalogFrameProps = {
  children: ReactNode
  presentation: "modal" | "tab"
  bottomSpace: number
  showCanvasStatusBar: boolean
}
export type CatalogMastheadProps = {
  firstItem: boolean
  onLayout: (event: LayoutChangeEvent) => void
  onAdd: () => void
  disabled: boolean
}
export type CatalogChoiceProps = {
  disabled?: boolean
  onAddProduct: () => void
  onAddService: () => void
}
