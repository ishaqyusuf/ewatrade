import type { CommerceCustomer } from "../commerce/commerce-model"

export type CustomerBookHeaderProps = {
  loadedCount: number
  pendingCount: number
  /** Loaded customers with no orders yet (Green Till sub line). */
  noOrdersCount?: number
  /** More directory pages remain, so the count is a floor. */
  hasMore?: boolean
  isLoading?: boolean
  hasError?: boolean
  isOffline?: boolean
  search?: string
  onSearch?: (value: string) => void
}

export type CustomerBookRowProps = {
  customer: CommerceCustomer
  historyComplete: boolean
  onPress: () => void
  /** Where the row sits in the shared list card (Green Till). */
  position?: { first: boolean; last: boolean }
}

export type CustomerBookFilterProps = {
  active: boolean
  count?: number
  label: string
  onPress: () => void
}

export type CustomerProfileProps = {
  customer: CommerceCustomer
  historyComplete: boolean
}
