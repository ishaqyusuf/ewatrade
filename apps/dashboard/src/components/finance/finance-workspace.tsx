"use client"
import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { ScrollableContent } from "@/components/scrollable-content"
import { TableToolbarSlotProvider } from "@/components/tables/core"
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
import { type ReactNode, Suspense } from "react"
import { ExpenseDataTable } from "../tables/expenses/data-table"
import { FinanceBankStatements } from "./bank-statements"
import { FinanceCashCountHistory } from "./cash-count-history"
import { FinanceAccounts } from "./finance-accounts"
import {
  FinanceDirectoryView,
  financeRowViewOptions,
} from "./finance-directory-view"
import { FinanceHeader, type FinanceView } from "./finance-header"
import { FinanceOverview } from "./finance-overview"
import { FinanceReports } from "./finance-reports"
import type { FinanceBook } from "./types"

const UNSAVED_VIEW: DirectoryViewSettings = { scope: "", view: null }

export function FinanceWorkspace({
  view,
  initialTableSettings,
  initialViewSettings,
}: {
  view: FinanceView
  initialTableSettings?: TableSettings
  initialViewSettings: DirectoryViewSettingsById<FinanceDirectoryPageId>
}) {
  const trpc = useTRPC()
  const { data: book } = useSuspenseQuery(trpc.finance.book.queryOptions())
  const page = (viewControl?: ReactNode, body?: ReactNode) => (
    <ScrollableContent>
      <div className="grid min-w-0 gap-6 pt-6">
        <FinanceHeader
          ready={Boolean(book)}
          view={view}
          viewControl={viewControl}
        />
        {book ? body : <FinanceSetupIntro />}
      </div>
    </ScrollableContent>
  )
  if (!book) return page()
  if (view === "overview") return page(null, <FinanceOverview book={book} />)
  if (view === "reports") return page(null, <FinanceReports book={book} />)
  return (
    <TableToolbarSlotProvider>
      <FinanceDirectoryPage
        view={view}
        book={book}
        initialTableSettings={initialTableSettings}
        initialViewSettings={initialViewSettings}
        page={page}
      />
    </TableToolbarSlotProvider>
  )
}

function FinanceDirectoryPage({
  view,
  book,
  initialTableSettings,
  initialViewSettings,
  page,
}: {
  view: Exclude<FinanceView, "overview" | "reports">
  book: FinanceBook
  initialTableSettings?: TableSettings
  initialViewSettings: DirectoryViewSettingsById<FinanceDirectoryPageId>
  page: (viewControl: ReactNode, body: ReactNode) => ReactNode
}) {
  const { expenseQuery, expenseStatus, supplierQuery } = useFinanceParams()
  if (view === "bank")
    return (
      <FinanceDirectoryView
        pageId="finance-bank-statements"
        queryKey="bankView"
        label="Bank statement view"
        options={financeRowViewOptions}
        initialSettings={
          initialViewSettings["finance-bank-statements"] ?? UNSAVED_VIEW
        }
      >
        {(directoryView, viewControl) =>
          page(
            viewControl,
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
                />
              </Suspense>
            </ErrorBoundary>,
          )
        }
      </FinanceDirectoryView>
    )
  if (view === "suppliers")
    return (
      <FinanceDirectoryView
        pageId="finance-suppliers"
        queryKey="supplierView"
        label="Supplier view"
        initialSettings={
          initialViewSettings["finance-suppliers"] ?? UNSAVED_VIEW
        }
      >
        {(directoryView, viewControl) =>
          page(
            viewControl,
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
            </ErrorBoundary>,
          )
        }
      </FinanceDirectoryView>
    )
  if (view === "accounts")
    return (
      <FinanceDirectoryView
        pageId="finance-accounts"
        queryKey="moneyAccountView"
        label="Money account view"
        initialSettings={
          initialViewSettings["finance-accounts"] ?? UNSAVED_VIEW
        }
      >
        {(directoryView, viewControl) =>
          page(
            viewControl,
            <>
              <FinanceAccounts book={book} view={directoryView} />
              <FinanceCashCountHistory book={book} />
            </>,
          )
        }
      </FinanceDirectoryView>
    )
  return (
    <FinanceDirectoryView
      pageId="expenses"
      queryKey="spendingView"
      label="Spending view"
      initialSettings={initialViewSettings.expenses ?? UNSAVED_VIEW}
    >
      {(directoryView, viewControl) =>
        page(
          viewControl,
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
          </ErrorBoundary>,
        )
      }
    </FinanceDirectoryView>
  )
}

function FinanceSetupIntro() {
  return (
    <section className="grid max-w-xl gap-3 py-10">
      <h2 className="text-xl font-medium">
        Start tracking your business money
      </h2>
      <p className="text-muted-foreground">
        Pick a start date, then add what is in your cash, bank and mobile money
        accounts on that day. Add expenses as you pay them. Older sales and
        payments aren&apos;t brought in.
      </p>
    </section>
  )
}
