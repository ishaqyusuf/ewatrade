import type { QueryClient, QueryKey } from "@tanstack/react-query"

export function isOrderVisibilityQuery(key: QueryKey) {
  const path = key[0]
  return (
    Array.isArray(path) &&
    ["orders", "search", "customers", "catalog"].includes(path[0])
  )
}

export async function purgeOrderVisibilityCache(client: QueryClient) {
  const filter = {
    predicate: (query: { queryKey: QueryKey }) =>
      isOrderVisibilityQuery(query.queryKey),
  }
  await client.cancelQueries(filter)
  // Reset clears cached data even for mounted screens, then refetches their
  // server-filtered values. The separate offline command store is untouched.
  await client.resetQueries(filter)
}

export function visibilityTightened(
  previous: string | undefined,
  current: string,
) {
  return current === "OWN_SALES" && previous !== "OWN_SALES"
}
