import "server-only"

import { getQueryClient, getServerClient, trpc } from "@/trpc/server"
import type { FinanceBookStatus } from "./types"

function settled<T>(read: Promise<T>) {
  return read.then(
    (data) => ({ ok: true as const, data }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

/** One protected read of all three panels; only the admitted Book may own its cache data. */
export function startFinanceOverviewReads(currentCurrency: string) {
  const client = getServerClient()
  const controller = new AbortController()
  const options = { signal: controller.signal }
  return {
    cancel: () => controller.abort(),
    overview: settled(
      client.finance.overview.query({ currentCurrency }, options),
    ),
  }
}

function missingCurrentBook(error: unknown) {
  const data =
    error && typeof error === "object" && "data" in error ? error.data : null
  return (
    data &&
    typeof data === "object" &&
    "code" in data &&
    data.code === "NOT_FOUND"
  )
}

export function prefetchAdmittedFinanceOverview(
  reads: ReturnType<typeof startFinanceOverviewReads>,
  book: Pick<FinanceBookStatus, "id">,
) {
  const client = getServerClient()
  const queryClient = getQueryClient()
  void queryClient.prefetchQuery({
    ...trpc.finance.overview.queryOptions({ bookId: book.id }),
    queryFn: async () => {
      const result = await reads.overview
      if (result.ok && result.data.balances.resolvedBookId === book.id)
        return result.data
      if (!result.ok && !missingCurrentBook(result.error)) throw result.error
      // Currency/Book changed during the read; fetch the admitted identity.
      return client.finance.overview.query({ bookId: book.id })
    },
  })
}
