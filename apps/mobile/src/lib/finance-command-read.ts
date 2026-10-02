import { FinanceCommandRecoveryError } from "@ewatrade/utils/finance-command-identity"
import type {
  FetchQueryOptions,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query"

/** A cached or already-running request cannot authorize recovery acknowledgement. */
export async function readFreshFinanceCommand<
  T,
  TError = Error,
  TData = T,
  TKey extends QueryKey = QueryKey,
>(
  client: QueryClient,
  options: FetchQueryOptions<T, TError, TData, TKey>,
  isCurrent: () => boolean,
) {
  function guard() {
    if (!isCurrent())
      throw new FinanceCommandRecoveryError(
        "Return online to the original account before checking this submission.",
      )
  }
  guard()
  await client.cancelQueries(
    { queryKey: options.queryKey, exact: true },
    { silent: true },
  )
  guard()
  const before = client.getQueryState(options.queryKey)
  if (before && before.fetchStatus !== "idle")
    throw new FinanceCommandRecoveryError(
      "The earlier submission read is still active. Try again.",
    )
  const result = await client.fetchQuery({
    ...options,
    staleTime: 0,
    retry: false,
  })
  guard()
  const after = client.getQueryState(options.queryKey)
  if (after?.status !== "success" || after.fetchStatus !== "idle")
    throw new FinanceCommandRecoveryError(
      "A fresh submission result is unavailable. Reconnect and try again.",
    )
  return result
}
