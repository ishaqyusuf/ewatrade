import type { QueryKey } from "@tanstack/react-query"

type CachedQuery = {
  queryKey: QueryKey
  state: { status: string; data: unknown }
}

/** Public tRPC key shape for this app's unprefixed options proxy. */
function hasLoadedSnapshot(
  query: CachedQuery,
  namespace: string,
  procedures: readonly string[],
) {
  if (
    query.state.status !== "success" ||
    query.state.data === undefined ||
    query.state.data === null
  )
    return false
  const [path, options] = query.queryKey
  if (
    !Array.isArray(path) ||
    path.length !== 2 ||
    path[0] !== namespace ||
    !procedures.includes(path[1]) ||
    !options ||
    typeof options !== "object" ||
    !("input" in options)
  )
    return false
  const input = options.input
  if (!input || typeof input !== "object" || !("snapshotSequence" in input))
    return false
  const sequence = input.snapshotSequence
  return (
    typeof sequence === "string" &&
    /^(0|[1-9]\d{0,18})$/.test(sequence) &&
    BigInt(sequence) <= BigInt("9223372036854775807")
  )
}

export function isLoadedFinanceStatement(query: CachedQuery) {
  return hasLoadedSnapshot(query, "finance", [
    "accountActivity",
    "accountLedger",
  ])
}

/** Entries/totals are pinned; command revisions come from live accountDetail. */
export function isLoadedCustomerLedgerStatement(query: CachedQuery) {
  return hasLoadedSnapshot(query, "customerLedger", ["statement"])
}

/**
 * Loaded Finance records an account or category creation cannot change: they
 * list existing bills/cash counts only. Failed, pending and unfamiliar keys refresh.
 */
export function isLoadedFinanceRecord(query: CachedQuery) {
  if (
    query.state.status !== "success" ||
    query.state.data === undefined ||
    query.state.data === null
  )
    return false
  const [path] = query.queryKey
  return (
    Array.isArray(path) &&
    path.length === 2 &&
    path[0] === "finance" &&
    ["bills", "cashCounts", "cashCount"].includes(path[1])
  )
}
