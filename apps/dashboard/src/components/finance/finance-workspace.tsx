"use client"
import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { ExpenseTableSkeleton } from "@/components/tables/expenses/skeleton"
import { FinanceBankStatementTableSkeleton } from "@/components/tables/finance-bank-statements/skeleton"
import { FinanceSupplierDataTable } from "@/components/tables/finance-suppliers/data-table"
import { FinanceSupplierTableSkeleton } from "@/components/tables/finance-suppliers/skeleton"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import type {
  DirectoryViewSettings,
  DirectoryViewSettingsById,
  FinanceDirectoryPageId,
} from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { useSuspenseQuery } from "@tanstack/react-query"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
import { ExpenseDataTable } from "../tables/expenses/data-table"
import { FinanceBankStatements } from "./bank-statements"
import { FinanceCashCountHistory } from "./cash-count-history"
import { ExpenseSearchFilter } from "./expense-search-filter"
import { FinanceAccounts } from "./finance-accounts"
import { FinanceDirectoryView } from "./finance-directory-view"
import { FinanceHeader } from "./finance-header"
import { FinanceReports } from "./finance-reports"
import { OpenFinanceSheet } from "./open-finance-sheet"

const UNSAVED_VIEW: DirectoryViewSettings = { scope: "", view: null }

export function FinanceWorkspace({
  view,
  initialTableSettings,
  initialViewSettings,
}: {
  view: "overview" | "spending" | "accounts" | "reports" | "suppliers" | "bank"
  initialTableSettings?: TableSettings
  initialViewSettings: DirectoryViewSettingsById<FinanceDirectoryPageId>
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
            {view === "bank" ? (
              <FinanceDirectoryView
                pageId="finance-bank-statements"
                queryKey="bankView"
                label="Bank statement view"
                initialSettings={
                  initialViewSettings["finance-bank-statements"] ?? UNSAVED_VIEW
                }
              >
                {(directoryView, switcher) => (
                  <ErrorBoundary errorComponent={WorkspaceError}>
                    <Suspense
                      fallback={
                        <FinanceBankStatementTableSkeleton
                          settings={initialTableSettings}
                          view={directoryView}
                        />
                      }
                    >
                      <FinanceBankStatements
                        key={book.id}
                        book={book}
                        initialTableSettings={initialTableSettings}
                        view={directoryView}
                        viewSwitcher={switcher}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </FinanceDirectoryView>
            ) : null}
            {view === "suppliers" ? (
              <FinanceDirectoryView
                pageId="finance-suppliers"
                queryKey="supplierView"
                label="Supplier view"
                initialSettings={
                  initialViewSettings["finance-suppliers"] ?? UNSAVED_VIEW
                }
              >
                {(directoryView, switcher) => (
                  <section className="flex min-w-0 flex-col gap-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="max-w-2xl text-sm text-muted-foreground">
                        Opening payables and supplier advances recorded in this
                        finance book. Purchase bills and inventory costs are not
                        included yet.
                      </p>
                      {switcher}
                    </div>
                    <ErrorBoundary errorComponent={WorkspaceError}>
                      <Suspense
                        fallback={
                          <FinanceSupplierTableSkeleton
                            settings={initialTableSettings}
                            view={directoryView}
                          />
                        }
                      >
                        <FinanceSupplierDataTable
                          key={`${book.id}:${supplierQuery}`}
                          book={book}
                          initialSettings={initialTableSettings}
                          view={directoryView}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </section>
                )}
              </FinanceDirectoryView>
            ) : null}
            {view === "reports" ? <FinanceReports book={book} /> : null}
            {view === "overview" || view === "accounts" ? (
              <FinanceDirectoryView
                pageId="finance-accounts"
                queryKey="moneyAccountView"
                label="Money account view"
                initialSettings={
                  initialViewSettings["finance-accounts"] ?? UNSAVED_VIEW
                }
              >
                {(directoryView, switcher) => (
                  <FinanceAccounts
                    book={book}
                    view={directoryView}
                    viewSwitcher={switcher}
                  />
                )}
              </FinanceDirectoryView>
            ) : null}
            {view === "accounts" ? (
              <FinanceCashCountHistory book={book} />
            ) : null}
            {view === "overview" || view === "spending" ? (
              <FinanceDirectoryView
                pageId="expenses"
                queryKey="spendingView"
                label="Spending view"
                initialSettings={initialViewSettings.expenses ?? UNSAVED_VIEW}
              >
                {(directoryView, switcher) => (
                  <section className="grid gap-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-lg font-medium">Spending records</h2>
                      {switcher}
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
                          <ExpenseTableSkeleton
                            settings={initialTableSettings}
                            view={directoryView}
                          />
                        }
                      >
                        <ExpenseDataTable
                          key={`${book.id}:${expenseQuery}:${expenseStatus}`}
                          book={book}
                          initialSettings={initialTableSettings}
                          view={directoryView}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </section>
                )}
              </FinanceDirectoryView>
            ) : null}
          </>
        )}
      </div>
    </ScrollableContent>
  )
}
