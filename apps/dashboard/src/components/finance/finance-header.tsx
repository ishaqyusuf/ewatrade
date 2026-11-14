"use client"
import { SecondaryMenu } from "@/components/secondary-menu"
import { TableToolbarSlot } from "@/components/tables/core"
import { useFinanceParams } from "@/hooks/use-finance-params"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"
import { ExpenseSearchFilter } from "./expense-search-filter"
import { OpenFinanceSheet } from "./open-finance-sheet"
import { FinanceSupplierSearchFilter } from "./supplier-search-filter"

export type FinanceView =
  | "overview"
  | "spending"
  | "accounts"
  | "reports"
  | "suppliers"
  | "bank"

export const FINANCE_MENU_ITEMS = [
  { path: "/finance", label: "Overview" },
  { path: "/finance/spending", label: "Spending" },
  { path: "/finance/accounts", label: "Money accounts" },
  { path: "/finance/payments", label: "Payments to check" },
  { path: "/finance/bank", label: "Bank" },
  { path: "/finance/suppliers", label: "Suppliers" },
  { path: "/customer-ledger", label: "Customer balances" },
  { path: "/finance/refunds", label: "Refunds" },
  { path: "/finance/reports", label: "Reports" },
]

/**
 * Every Finance page shares one header: the section tabs, then search (on
 * lists) and the page's actions. The top bar already names the page, so
 * there is no title or description here.
 */
export function FinanceHeader({
  ready,
  view,
  viewControl,
}: {
  ready: boolean
  view: FinanceView
  viewControl?: ReactNode
}) {
  const hasTable =
    view === "spending" ||
    view === "bank" ||
    view === "suppliers" ||
    view === "accounts"
  const search =
    ready && view === "spending" ? (
      <ExpenseSearchFilter />
    ) : ready && view === "suppliers" ? (
      <FinanceSupplierSearchFilter />
    ) : null
  const tableControls = hasTable ? (
    <div className="flex items-center gap-2 max-md:hidden">
      <TableToolbarSlot />
      {viewControl}
    </div>
  ) : null
  return (
    <header className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="min-w-0 flex-1">
          <SecondaryMenu items={FINANCE_MENU_ITEMS} label="Finance" />
        </div>
        {ready ? (
          <div className="flex min-w-0 items-center gap-2 max-sm:w-full">
            <FinancePageActions view={view} />
          </div>
        ) : null}
      </div>
      {ready && (search || tableControls) ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {search ? (
            <div className="min-w-0 flex-1 basis-full sm:basis-72">
              {search}
            </div>
          ) : null}
          {tableControls ? (
            <div className="sm:ml-auto">{tableControls}</div>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}

function FinancePageActions({ view }: { view: FinanceView }) {
  if (view === "spending") return <AddSpendingMenu />
  if (view === "accounts")
    return (
      <>
        <OpenFinanceSheet mode="money">Move money</OpenFinanceSheet>
        <OpenFinanceSheet mode="account" primary>
          Add account
        </OpenFinanceSheet>
      </>
    )
  if (view === "bank")
    return (
      <OpenFinanceSheet mode="bank-import" primary>
        Upload statement
      </OpenFinanceSheet>
    )
  if (view === "suppliers")
    return (
      <OpenFinanceSheet mode="supplier" primary>
        Add supplier
      </OpenFinanceSheet>
    )
  if (view === "reports") return null
  return (
    <OpenFinanceSheet mode="expense" primary>
      Add expense
    </OpenFinanceSheet>
  )
}

/** Spending: Add expense is one tap; a new category sits under More. */
function AddSpendingMenu() {
  const { setParams } = useFinanceParams()
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="outline" />}
        >
          More
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            data-icon="inline-end"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent appearance="dashboard" align="end">
          <DropdownMenuItem
            onClick={() =>
              void setParams({
                financeSheet: "category",
                statementId: null,
                billId: null,
                supplierId: null,
                countId: null,
                moneyEntryId: null,
              })
            }
          >
            New spending category
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <OpenFinanceSheet mode="expense" primary>
        Add expense
      </OpenFinanceSheet>
    </>
  )
}
