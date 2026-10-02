"use client"
import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { ExpenseTableSkeleton } from "@/components/tables/expenses/skeleton"
import { FinanceSupplierDataTable } from "@/components/tables/finance-suppliers/data-table"
import { FinanceSupplierTableSkeleton } from "@/components/tables/finance-suppliers/skeleton"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import type { TableSettings } from "@/utils/table-settings"
import { useSuspenseQuery } from "@tanstack/react-query"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
import { ExpenseDataTable } from "../tables/expenses/data-table"
import { FinanceCashCountHistory } from "./cash-count-history"
import { ExpenseSearchFilter } from "./expense-search-filter"
import { FinanceAccounts } from "./finance-accounts"
import { FinanceHeader } from "./finance-header"
import { FinanceReports } from "./finance-reports"
import { OpenFinanceSheet } from "./open-finance-sheet"

export function FinanceWorkspace({
  view,
  initialTableSettings,
}: {
  view: "overview" | "spending" | "accounts" | "reports" | "suppliers"
  initialTableSettings?: TableSettings
}) {
  const trpc = useTRPC()
  const { data: book } = useSuspenseQuery(trpc.finance.book.queryOptions())
  const { expenseQuery, expenseStatus, supplierQuery } = useFinanceParams()
  return (
    <ScrollableContent>
      <div className="grid min-w-0 gap-6 pt-6">
        <FinanceHeader ready={Boolean(book)} view={view} />
        {!book ? (
          <section className="grid max-w-xl gap-3 py-10">
            <h2 className="text-xl font-medium">
              Know what you spend and what you owe
            </h2>
            <p className="text-muted-foreground">
              Start your financial book, add opening cash and bank balances, and
              record expenses with their payments.
            </p>
          </section>
        ) : (
          <>
            {view === "suppliers" ? (
              <section className="flex min-w-0 flex-col gap-5">
                <p className="text-sm text-muted-foreground">
                  Opening payables and supplier advances recorded in this
                  finance book. Purchase bills and inventory costs are not
                  included yet.
                </p>
                <ErrorBoundary errorComponent={WorkspaceError}>
                  <Suspense
                    fallback={
                      <FinanceSupplierTableSkeleton
                        settings={initialTableSettings}
                      />
                    }
                  >
                    <FinanceSupplierDataTable
                      key={`${book.id}:${supplierQuery}`}
                      book={book}
                      initialSettings={initialTableSettings}
                    />
                  </Suspense>
                </ErrorBoundary>
              </section>
            ) : null}
            {view === "reports" ? <FinanceReports book={book} /> : null}
            {view === "overview" || view === "accounts" ? (
              <FinanceAccounts book={book} />
            ) : null}
            {view === "accounts" ? (
              <FinanceCashCountHistory book={book} />
            ) : null}
            {view === "overview" || view === "spending" ? (
              <section className="grid gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-medium">Spending records</h2>
                </div>
                {view === "overview" ? (
                  <PageToolbar
                    actions={
                      <OpenFinanceSheet mode="category" secondary>
                        Add expense category
                      </OpenFinanceSheet>
                    }
                  >
                    <ExpenseSearchFilter />
                  </PageToolbar>
                ) : null}
                <ErrorBoundary errorComponent={WorkspaceError}>
                  <Suspense
                    fallback={
                      <ExpenseTableSkeleton settings={initialTableSettings} />
                    }
                  >
                    <ExpenseDataTable
                      key={`${book.id}:${expenseQuery}:${expenseStatus}`}
                      book={book}
                      initialSettings={initialTableSettings}
                    />
                  </Suspense>
                </ErrorBoundary>
              </section>
            ) : null}
          </>
        )}
      </div>
    </ScrollableContent>
  )
}
