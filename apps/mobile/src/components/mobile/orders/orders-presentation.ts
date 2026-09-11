import type { CommercialOrder } from "@/components/mobile/commerce"
import type { OrderDispatchDateFilter } from "@/lib/orders-dispatch-ledger"
import type { ReactNode } from "react"
import type { LayoutChangeEvent } from "react-native"

export type OrdersScreenProps = {
  children: ReactNode
  showCanvasStatusBar: boolean
}

export type OrdersMastheadProps = {
  businessName: string
  onCustomersPress: () => void
  onLayout?: (event: LayoutChangeEvent) => void
}

export type OrdersSummaryProps = {
  dateFilter: OrderDispatchDateFilter
  orders: CommercialOrder[]
}

export type OrdersRowProps = {
  index: number
  order: CommercialOrder
  onPress: () => void
}

export type OrdersFilterProps<T extends string> = {
  active: T
  labels?: Partial<Record<T, string>>
  onChange: (value: T) => void
  values: readonly T[]
}

export type OrderFilter = "all" | "cancelled" | "completed" | "open"
