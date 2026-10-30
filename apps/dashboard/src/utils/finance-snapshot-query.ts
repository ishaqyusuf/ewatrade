import type { QueryKey } from "@tanstack/react-query"

/** Public tRPC key shape for this app's unprefixed options proxy. */
export function isLoadedFinanceStatement(query: {
  queryKey: QueryKey
  state: { status: string; data: unknown }
}) {
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
    path[0] !== "finance" ||
    !["accountActivity", "accountLedger"].includes(path[1]) ||
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
