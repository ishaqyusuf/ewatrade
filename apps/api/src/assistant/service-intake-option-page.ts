import { TRPCError } from "@trpc/server"

export function serviceIntakeOptionPage<T extends { offeringId: string }>(
  offerings: T[],
  input: { query?: string; cursor?: string; offeringAfter?: string },
  nextCatalogCursor?: string,
) {
  const offset = input.offeringAfter
    ? offerings.findIndex((o) => o.offeringId === input.offeringAfter) + 1
    : 0
  if (input.offeringAfter && offset === 0)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Service options changed. Refresh the query before continuing.",
    })
  const selected = offerings.slice(offset, offset + 100)
  const continuation =
    offset + selected.length < offerings.length
      ? {
          query: input.query,
          cursor: input.cursor,
          offeringAfter: selected.at(-1)?.offeringId,
        }
      : nextCatalogCursor
        ? { query: input.query, cursor: nextCatalogCursor }
        : null
  return { offerings: selected, continuation, truncated: Boolean(continuation) }
}
