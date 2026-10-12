/** Current/review facts cannot be shown from cache while fresh authority is being checked. */
export function assistantFinanceReadState(
  validTarget: boolean,
  query: {
    isPending: boolean
    isFetching: boolean
    isError: boolean
  },
) {
  if (!validTarget) return "invalid" as const
  if (query.isPending || query.isFetching) return "loading" as const
  if (query.isError) return "error" as const
  return "ready" as const
}
