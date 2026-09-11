import type { ReactNode } from "react"
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native"
import type { AdminMoreItem } from "@/lib/admin-navigation"
export type MoreHeaderProps = {
  onSyncPress: () => void
  syncAlertCount: number
  onLayout?: (event: LayoutChangeEvent) => void
}
export type MoreWorkspaceProps = {
  businessName: string
  onPress: () => void
  roleLabel: string
}
export type MoreRowProps = {
  detail?: string
  item: AdminMoreItem
  onPress: () => void
}
export type MoreFrameProps = {
  children: ReactNode
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  showCanvasStatusBar: boolean
}
export function businessInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  return parts.length
    ? parts
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("")
    : "EW"
}
