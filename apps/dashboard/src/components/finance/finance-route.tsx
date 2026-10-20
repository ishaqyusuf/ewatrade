import { PageLoading } from "@/components/dashboard/page-loading"
import { loadFinanceBankFilterParams } from "@/hooks/finance-bank-filter-params"
import { loadFinanceExpenseFilterParams } from "@/hooks/finance-expense-filter-params"
import { loadFinanceSupplierFilterParams } from "@/hooks/finance-supplier-filter-params"
import {
  expenseSortFields,
  getTableSort,
  loadSortParams,
} from "@/hooks/sort-params"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { getQueryClient, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import type { FinanceDirectoryPageId } from "@/utils/directory-view-settings"
import { getInitialDirectoryView } from "@/utils/directory-views"
import { HydrationBoundary, dehydrate } from "@tanstack/react-query"
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
  const initialTableSettings =
    view === "overview" ||
    view === "spending" ||
    view === "suppliers" ||
    view === "bank"
      ? await getInitialTableSettings(
          view === "bank"
            ? "finance-bank-statements"
            : view === "suppliers"
              ? "finance-suppliers"
              : "expenses",
          {
            userId: session.user.id,
            tenantId: tenant.tenant.id,
          },
        )
      : undefined
  const directoryPageIds: FinanceDirectoryPageId[] =
    view === "overview"
      ? ["finance-accounts", "expenses"]
      : view === "spending"
        ? ["expenses"]
        : view === "accounts"
          ? ["finance-accounts"]
          : view === "suppliers"
            ? ["finance-suppliers"]
            : view === "bank"
              ? ["finance-bank-statements"]
              : []
  const initialViewSettings = Object.fromEntries(
    await Promise.all(
      directoryPageIds.map(
        async (pageId) =>
          [
            pageId,
            await getInitialDirectoryView(pageId, {
              userId: session.user.id,
              tenantId: tenant.tenant.id,
            }),
          ] as const,
      ),
    ),
  )
  const book = await queryClient.fetchQuery(trpc.finance.book.queryOptions())
  if (book && view === "bank") {
    const filter = await loadFinanceBankFilterParams((await searchParams) ?? {})
    void queryClient.prefetchInfiniteQuery(
      trpc.finance.bankStatements.list.infiniteQueryOptions(
        {
          bookId: book.id,
          accountId: filter.bankAccountId || undefined,
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
      trpc.finance.suppliers.infiniteQueryOptions(
        {
          bookId: book.id,
          query: filter.supplierQuery.trim() || undefined,
          limit: 30,
        },
        {
          getNextPageParam: (page) => page.nextCursor ?? undefined,
          retry: false,
        },
      ),
    )
  }
  if (book && (view === "overview" || view === "spending")) {
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
