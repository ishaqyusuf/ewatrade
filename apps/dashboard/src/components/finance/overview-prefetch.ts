import "server-only"

import { getQueryClient, getServerClient, trpc } from "@/trpc/server"
import type { FinanceBook } from "./types"

function settled<T>(read: Promise<T>) {
  return read.then(
    (data) => ({ ok: true as const, data }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

/** Independent protected reads; only the admitted Book may own their cache data. */
export function startFinanceOverviewReads(currentCurrency: string) {
  const client = getServerClient()
  const controller = new AbortController()
  const options = { signal: controller.signal }
  return {
    cancel: () => controller.abort(),
    balances: settled(
      client.finance.balances.query({ currentCurrency }, options),
    ),
    owed: settled(
      client.finance.owedSummary.query({ currentCurrency }, options),
    ),
    bills: settled(
      client.finance.bills.query({ currentCurrency, limit: 5 }, options),
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

async function admittedRead<T extends { resolvedBookId?: string }>(
  read: ReturnType<typeof settled<T>>,
  bookId: string,
  fallback: () => Promise<T>,
) {
  const result = await read
  if (result.ok && result.data.resolvedBookId === bookId) return result.data
  if (!result.ok && !missingCurrentBook(result.error)) throw result.error
  // Currency/Book changed during independent reads; fetch the admitted identity.
  return fallback()
}

export function prefetchAdmittedFinanceOverview(
  reads: ReturnType<typeof startFinanceOverviewReads>,
  book: FinanceBook,
) {
  const client = getServerClient()
  const queryClient = getQueryClient()
  void queryClient.prefetchQuery({
    ...trpc.finance.balances.queryOptions({ bookId: book.id }),
    queryFn: () =>
      admittedRead(reads.balances, book.id, () =>
        client.finance.balances.query({ bookId: book.id }),
      ),
  })
  void queryClient.prefetchQuery({
    ...trpc.finance.owedSummary.queryOptions({ bookId: book.id }),
    queryFn: () =>
      admittedRead(reads.owed, book.id, () =>
        client.finance.owedSummary.query({ bookId: book.id }),
      ),
  })
  void queryClient.prefetchQuery({
    ...trpc.finance.bills.queryOptions({ bookId: book.id, limit: 5 }),
    queryFn: () =>
      admittedRead(reads.bills, book.id, () =>
        client.finance.bills.query({ bookId: book.id, limit: 5 }),
      ),
  })
}
