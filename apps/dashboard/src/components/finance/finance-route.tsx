import { PageLoading } from "@/components/dashboard/page-loading"
import { loadFinanceBankFilterParams } from "@/hooks/finance-bank-filter-params"
import { loadFinanceExpenseFilterParams } from "@/hooks/finance-expense-filter-params"
import { loadFinanceSupplierFilterParams } from "@/hooks/finance-supplier-filter-params"
import {
  expenseSortFields,
  getTableSort,
  loadSortParams,
} from "@/hooks/sort-params"
import { DASHBOARD_REQUEST_KIND_HEADER } from "@/lib/navigation-request"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { getQueryClient, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import type { FinanceDirectoryPageId } from "@/utils/directory-view-settings"
import { getInitialDirectoryView } from "@/utils/directory-views"
import { HydrationBoundary, dehydrate } from "@tanstack/react-query"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { FinanceWorkspace } from "./finance-workspace"

export async function FinanceRoute({
  view,
  searchParams,
}: {
  view: "overview" | "spending" | "accounts" | "reports" | "suppliers" | "bank"
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getServerSession()
  if (!session) redirect("/")
  const tenant = await getActiveTenant(session.user.id)
  if (
    !tenant ||
    !["OWNER", "ADMIN"].includes(tenant.membership.role.toUpperCase())
  )
    redirect("/")
  const queryClient = getQueryClient()
  const tableId =
    view === "bank"
      ? "finance-bank-statements"
      : view === "suppliers"
        ? "finance-suppliers"
        : view === "spending"
          ? "expenses"
          : undefined
  const directoryPageIds: FinanceDirectoryPageId[] =
    view === "spending"
      ? ["expenses"]
      : view === "accounts"
        ? ["finance-accounts"]
        : view === "suppliers"
          ? ["finance-suppliers"]
          : view === "bank"
            ? ["finance-bank-statements"]
            : []
  const identity = { userId: session.user.id, tenantId: tenant.tenant.id }
  const [initialTableSettings, viewEntries, book] = await Promise.all([
    tableId ? getInitialTableSettings(tableId, identity) : undefined,
    Promise.all(
      directoryPageIds.map(
        async (pageId) =>
          [pageId, await getInitialDirectoryView(pageId, identity)] as const,
      ),
    ),
    queryClient.fetchQuery(trpc.finance.book.queryOptions()),
  ])
  const initialViewSettings = Object.fromEntries(viewEntries)
  if (
    book &&
    view === "overview" &&
    (await headers()).get(DASHBOARD_REQUEST_KIND_HEADER) === "document"
  ) {
    // Full-page loads can overlap the visible panels with client-code loading.
    // Soft navigation keeps the browser's existing freshness/invalidation owner.
    void queryClient.prefetchQuery(
      trpc.finance.balances.queryOptions({ bookId: book.id }),
    )
    void queryClient.prefetchQuery(
      trpc.finance.owedSummary.queryOptions({ bookId: book.id }),
    )
    void queryClient.prefetchQuery(
      trpc.finance.bills.queryOptions({ bookId: book.id, limit: 5 }),
    )
  }
  if (book && view === "bank") {
    const filter = await loadFinanceBankFilterParams((await searchParams) ?? {})
    void queryClient.prefetchInfiniteQuery(
      trpc.finance.bankStatements.list.infiniteQueryOptions(
        {
          bookId: book.id,
          accountId: filter.bankAccountId || undefined,
          query: filter.bankQuery.trim() || undefined,
          limit: 30,
        },
        {
          getNextPageParam: (page) => page.nextCursor ?? undefined,
          retry: false,
        },
      ),
    )
  }
  if (book && view === "suppliers") {
    const filter = await loadFinanceSupplierFilterParams(
      (await searchParams) ?? {},
    )
    void queryClient.prefetchInfiniteQuery(
      trpc.finance.supplierDirectory.infiniteQueryOptions(
        {
          bookId: book.id,
          query: filter.supplierQuery.trim() || undefined,
          filter: filter.supplierFilter ?? undefined,
          sort: filter.supplierSort,
          limit: 30,
        },
        {
          getNextPageParam: (page) => page.nextCursor ?? undefined,
          retry: false,
        },
      ),
    )
  }
  if (book && view === "spending") {
    const params = (await searchParams) ?? {}
    const filter = await loadFinanceExpenseFilterParams(params)
    const { sort } = await loadSortParams(params)
    void queryClient.prefetchInfiniteQuery(
      trpc.finance.bills.infiniteQueryOptions(
        {
          bookId: book.id,
          limit: 30,
          query: filter.expenseQuery || undefined,
          status: filter.expenseStatus ?? undefined,
          sort: getTableSort(sort, expenseSortFields),
        },
        {
          getNextPageParam: (page) => page.nextCursor ?? undefined,
          retry: false,
        },
      ),
    )
  }
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<PageLoading />}>
        <FinanceWorkspace
          view={view}
          initialTableSettings={initialTableSettings}
          initialViewSettings={initialViewSettings}
        />
      </Suspense>
    </HydrationBoundary>
  )
}
