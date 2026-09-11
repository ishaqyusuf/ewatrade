export type CustomerBookFilter = "all" | "pending" | "synced"

export function getCustomerBookPresentation({
  customerCount,
  filter,
  hasError,
  isLoading,
  isOffline,
  search,
}: {
  customerCount: number
  filter: CustomerBookFilter
  hasError: boolean
  isLoading: boolean
  isOffline: boolean
  search: string
}) {
  const hasActiveQuery = filter !== "all" || search.trim().length > 0
  const showInitialCreateAction =
    customerCount === 0 &&
    !hasActiveQuery &&
    !isLoading &&
    !hasError &&
    !isOffline

  return {
    showFilters: !showInitialCreateAction,
    showInitialCreateAction,
    showStandardCreateFab: !showInitialCreateAction,
  }
}
