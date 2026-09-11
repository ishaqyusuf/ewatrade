import type { MobileAppShell } from "@/components/mobile/app-shell"
import type { ComponentProps, ReactNode } from "react"

export type DashboardScreenProps = Pick<
  ComponentProps<typeof MobileAppShell>,
  | "businessName"
  | "centralAction"
  | "children"
  | "hero"
  | "navItems"
  | "onBottomTabVisibilityChange"
  | "refreshControl"
  | "role"
  | "showBottomTabs"
  | "title"
>

export type DashboardHeroProps = {
  businessName: string
  greetingName: string
  hasNotification?: boolean
  onBusinessPress: () => void
  onNotificationPress: () => void
  onProfilePress?: () => void
  onSearchPress?: () => void
  cue?: string
}

export type DashboardSyncProps = {
  syncLabel?: string
  syncTone?: "attention" | "ready"
}

export type DashboardSetupProps = DashboardSyncProps & {
  catalogReady: boolean
  itemValue: string
  onAddItemPress: () => void
  onCreateOrderPress: () => void
  onInviteStaffPress: () => void
  orderValue: string
  revenueValue: string
}

export type DashboardOverviewProps = DashboardSyncProps & {
  primaryDetail: string
  primaryLabel: string
  primaryValue: string
  recentOrderDetail: string
  recentOrderValue: string
  revenueDetail: string
  revenueValue: string
}

export type DashboardSectionProps = {
  actionLabel?: string
  onActionPress?: () => void
  title: string
}

export type DashboardEmptyOrdersProps = {
  actionDisabled?: boolean
  actionLabel?: string
  message: string
  onActionPress?: () => void
}

export type SalesRepOverviewProps = {
  catalogFactDetail: string
  catalogFactValue: string
  onCloseoutPress: () => void
  onCustomerBookPress?: () => void
  onStartSalePress: () => void
  onSyncPress: () => void
  readinessLabel: string
  recentOrderCount: string
  recentOrderValue: string
  saleActionDetail: string
  saleActionDisabled: boolean
  saleActionLabel: string
  syncLabel: string
  syncTone: "attention" | "ready"
}

export type SalesRepSectionProps = { children: ReactNode; title: string }
