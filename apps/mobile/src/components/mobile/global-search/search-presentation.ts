import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { IconKeys } from "@/components/ui/icon"
import type { ReactNode } from "react"
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native"
export type SearchResult = RouterOutputs["search"]["global"][number]
export type SearchAction = {
  detail: string
  icon: IconKeys
  id: string
  label: string
  onPress: () => void
}
export type SearchRowProps = { item: SearchResult; onPress: () => void }
export type SearchHeaderProps = {
  onClose: () => void
  onLayout?: (event: LayoutChangeEvent) => void
}
export type SearchFrameProps = {
  children: ReactNode
  footerHeight: number
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  showCanvasStatusBar: boolean
}
export const SEARCH_GROUP_ORDER: SearchResult["type"][] = [
  "order",
  "customer",
  "catalog_item",
  "service_job",
  "staff",
]
export function resultGroupLabel(type: SearchResult["type"]) {
  if (type === "catalog_item") return "Products & services"
  if (type === "service_job") return "Service work"
  return type.charAt(0).toUpperCase() + type.slice(1) + "s"
}
export function searchResultIcon(type: SearchResult["type"]): IconKeys {
  if (type === "order") return "ReceiptText"
  if (type === "customer") return "User"
  if (type === "service_job") return "Wrench"
  if (type === "staff") return "Users"
  return "Warehouse"
}
