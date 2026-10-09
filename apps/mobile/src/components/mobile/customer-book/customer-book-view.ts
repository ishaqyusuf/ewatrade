import type { CommerceCustomer } from "../commerce/commerce-model"

export type CustomerBookHeaderProps = {
  loadedCount: number
  pendingCount: number
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
}

export type CustomerBookFilterProps = {
  active: boolean
  label: string
  onPress: () => void
}

export type CustomerProfileProps = {
  customer: CommerceCustomer
  historyComplete: boolean
}
