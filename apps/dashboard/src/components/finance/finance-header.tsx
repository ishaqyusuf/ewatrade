import { PageHeader, PageToolbar } from "@/components/page-header"
import { SecondaryMenu } from "@/components/secondary-menu"
import { ExpenseSearchFilter } from "./expense-search-filter"
import { OpenFinanceSheet } from "./open-finance-sheet"
import { FinanceSupplierSearchFilter } from "./supplier-search-filter"

export function FinanceHeader({
  ready,
  view,
}: {
  ready: boolean
  view: "overview" | "spending" | "accounts" | "reports" | "suppliers" | "bank"
}) {
  return (
    <PageHeader
      eyebrow="Business money"
      title={
        view === "bank"
          ? "Bank statements"
          : view === "suppliers"
            ? "Suppliers"
            : view === "spending"
              ? "Spending"
              : view === "accounts"
                ? "Money accounts"
                : view === "reports"
                  ? "Reports"
                  : "Finance"
      }
    >
      <PageToolbar
        actions={
          <>
            {ready && view === "spending" ? (
              <OpenFinanceSheet mode="category">
                Add expense category
              </OpenFinanceSheet>
            ) : null}
            <OpenFinanceSheet
              icon
              mode={
                ready
                  ? view === "bank"
                    ? "bank-import"
                    : view === "suppliers"
                      ? "supplier"
                      : "expense"
                  : "setup"
              }
            >
              {ready
                ? view === "bank"
                  ? "Import statement"
                  : view === "suppliers"
                    ? "New supplier"
                    : "Record expense"
                : "Set up finance"}
            </OpenFinanceSheet>
          </>
        }
      >
        {ready && view === "spending" ? <ExpenseSearchFilter /> : null}
        {ready && view === "suppliers" ? <FinanceSupplierSearchFilter /> : null}
      </PageToolbar>
      <SecondaryMenu
        items={[
          { path: "/finance", label: "Overview" },
          { path: "/finance/spending", label: "Spending" },
          { path: "/finance/accounts", label: "Accounts" },
          { path: "/finance/bank", label: "Bank" },
          { path: "/finance/suppliers", label: "Suppliers" },
          { path: "/finance/reports", label: "Reports" },
        ]}
        label="Finance"
      />
    </PageHeader>
  )
}
