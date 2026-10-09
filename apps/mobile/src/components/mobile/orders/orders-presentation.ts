import type { CommercialOrder } from "@/components/mobile/commerce"
import type { OrderDispatchDateFilter } from "@/lib/orders-dispatch-ledger"
import type { ReactNode } from "react"
import type { LayoutChangeEvent } from "react-native"

export type OrdersScreenProps = {
  children: ReactNode
  showCanvasStatusBar: boolean
}

export type OrdersMastheadProps = {
  title?: string
  businessName: string
  onCustomersPress: () => void
  onSelectReceipts?: () => void
  selectingReceipts?: boolean
  selectionDisabled?: boolean
  onLayout?: (event: LayoutChangeEvent) => void
}

export type OrdersSummaryProps = {
  dateFilter: OrderDispatchDateFilter
  loading?: boolean
  orders: CommercialOrder[]
  totalCount?: number
  isOffline?: boolean
  savedAt?: string
  onDateChange?: (value: OrderDispatchDateFilter) => void
  /** Classic: server sales totals for the chosen period. */
  report?: {
    currencyCode: string
    orderCount: number
    orderValueMinor: number
    outstandingMinor?: number
    partial?: boolean
  } | null
}

export type OrdersRowProps = {
  selecting?: boolean
  selected?: boolean
  disabled?: boolean
  index: number
  order: CommercialOrder
  onPress: () => void
  /** Classic: rows of one day share a card. */
  position?: { first: boolean; last: boolean }
}

export type OrdersFilterProps<T extends string> = {
  active: T
  labels?: Partial<Record<T, string>>
  onChange: (value: T) => void
  values: readonly T[]
}

export type OrderFilter = "all" | "cancelled" | "completed" | "open"
