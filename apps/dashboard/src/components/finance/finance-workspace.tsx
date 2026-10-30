"use client"
import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { ScrollableContent } from "@/components/scrollable-content"
import { loadSheetCode } from "@/components/sheets/load-sheet-code"
import { SheetBodyLoading } from "@/components/sheets/sheet-frame"
import { TableToolbarSlotProvider } from "@/components/tables/core"
import { ExpenseTableSkeleton } from "@/components/tables/expenses/skeleton"
import { FinanceBankStatementTableSkeleton } from "@/components/tables/finance-bank-statements/skeleton"
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
import dynamic from "next/dynamic"
import { type ReactNode, Suspense } from "react"
import {
  FinanceDirectoryView,
  financeRowViewOptions,
} from "./finance-directory-view"
import { FinanceHeader, type FinanceView } from "./finance-header"
import type { FinanceBook } from "./types"

// Each view's code loads only when its route selects it; SSR stays on. Page
// views keep the header during code loading; directory tables suspend into
// their existing skeleton boundaries.
const FinanceOverview = dynamic(
  () =>
    loadSheetCode(
      () => import("./finance-overview").then((mod) => mod.FinanceOverview),
      "body",
    ),
  { loading: SheetBodyLoading },
)
const FinanceReports = dynamic(
  () =>
    loadSheetCode(
      () => import("./finance-reports").then((mod) => mod.FinanceReports),
      "body",
    ),
  { loading: SheetBodyLoading },
)
const FinanceAccounts = dynamic(
  () =>
    loadSheetCode(
      () => import("./finance-accounts").then((mod) => mod.FinanceAccounts),
      "body",
    ),
  { loading: SheetBodyLoading },
)
const FinanceCashCountHistory = dynamic(
  () =>
    loadSheetCode(
      () =>
        import("./cash-count-history").then(
          (mod) => mod.FinanceCashCountHistory,
        ),
      "body",
    ),
  { loading: SheetBodyLoading },
)
const FinanceBankStatements = dynamic(() =>
  loadSheetCode(
    () => import("./bank-statements").then((mod) => mod.FinanceBankStatements),
    "body",
  ),
)
const FinanceSupplierDataTable = dynamic(() =>
  loadSheetCode(
    () =>
      import("@/components/tables/finance-suppliers/data-table").then(
        (mod) => mod.FinanceSupplierDataTable,
      ),
    "body",
  ),
)
const ExpenseDataTable = dynamic(() =>
  loadSheetCode(
    () =>
      import("../tables/expenses/data-table").then(
        (mod) => mod.ExpenseDataTable,
      ),
    "body",
  ),
)

/** Only a business without a Book renders setup; its form code loads with it. */
const FinanceSetupForm = dynamic(
  () =>
    loadSheetCode(
      () => import("./setup-form").then((mod) => mod.FinanceSetupForm),
      "body",
    ),
  { loading: SheetBodyLoading },
)

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
    <section className="my-6 grid max-w-xl gap-3 border border-border p-5">
      <h2 className="text-xl font-medium">
        Start tracking your business money
      </h2>
      <p className="text-sm text-muted-foreground">
        Pick the day you start tracking money in EwaTrade. Next you'll add what
        each cash, bank and mobile money account held on that day. Older sales
        and payments aren&apos;t brought in.
      </p>
      <FinanceSetupForm />
    </section>
  )
}
