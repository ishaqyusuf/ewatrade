export const LIST_PAGE_SIZE = 20
export const LIST_SEARCH_THRESHOLD = 10

export function shouldShowListSearch(totalCount: number) {
  return totalCount > LIST_SEARCH_THRESHOLD
}

export function shouldFetchNextListPage(input: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
}) {
  return input.hasNextPage && !input.isFetchingNextPage
}
