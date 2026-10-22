"use client"
import { PageHeader, PageToolbar } from "@/components/page-header"
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
import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"
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

// Finance pages workshop, direction 01: one name per page and a line saying what it is for.
const FINANCE_PAGE_COPY: Record<FinanceView, [string, string]> = {
  overview: [
    "Finance",
    "Your money at a glance: what you have, what you spent and who owes what.",
  ],
  spending: [
    "Spending",
    "What you spent, who you paid and what is still to pay.",
  ],
  accounts: [
    "Money accounts",
    "Cash, bank and mobile money you keep track of.",
  ],
  bank: [
    "Bank statements",
    "Check each line from your bank against what you recorded.",
  ],
  suppliers: [
    "Suppliers",
    "What you owe each Supplier, and what you paid them ahead.",
  ],
  reports: ["Reports", "Profit, money in and out, and what you own and owe."],
}

export const FINANCE_MENU_ITEMS = [
  { path: "/finance", label: "Overview" },
  { path: "/finance/spending", label: "Spending" },
  { path: "/finance/accounts", label: "Money accounts" },
  { path: "/finance/bank", label: "Bank" },
  { path: "/finance/suppliers", label: "Suppliers" },
  { path: "/customer-ledger", label: "Customer balances" },
  { path: "/finance/reports", label: "Reports" },
]

export function FinanceHeader({
  ready,
  view,
  viewControl,
}: {
  ready: boolean
  view: FinanceView
  viewControl?: ReactNode
}) {
  const [title, description] = FINANCE_PAGE_COPY[view]
  const hasTable =
    view === "spending" ||
    view === "bank" ||
    view === "suppliers" ||
    view === "accounts"
  return (
    <PageHeader
      eyebrow="Business money"
      title={title}
      description={description}
    >
      <PageToolbar
        actions={
          ready ? (
            <>
              {hasTable ? <TableToolbarSlot /> : null}
              {viewControl}
              <FinancePageActions view={view} />
            </>
          ) : // Not set up yet: the start-date form sits on the page itself.
          null
        }
      >
        {ready && view === "spending" ? <ExpenseSearchFilter /> : null}
        {ready && view === "suppliers" ? <FinanceSupplierSearchFilter /> : null}
      </PageToolbar>
      <SecondaryMenu items={FINANCE_MENU_ITEMS} label="Finance" />
    </PageHeader>
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

/** One Add button on Spending: an expense, or a category to group them. */
function AddSpendingMenu() {
  const { setParams } = useFinanceParams()
  const open = (mode: "expense" | "category") =>
    void setParams({
      financeSheet: mode,
      statementId: null,
      billId: null,
      supplierId: null,
      countId: null,
      moneyEntryId: null,
    })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" className="h-9 rounded-none" />}
      >
        <HugeiconsIcon
          icon={Add01Icon}
          data-icon="inline-start"
          aria-hidden="true"
        />
        Add
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          data-icon="inline-end"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent appearance="dashboard" align="end" className="w-72">
        <DropdownMenuItem
          className="grid gap-0.5 py-2"
          onClick={() => open("expense")}
        >
          <span className="font-medium">Expense</span>
          <span className="text-xs text-muted-foreground">
            Something you paid for, or still owe.
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="grid gap-0.5 py-2"
          onClick={() => open("category")}
        >
          <span className="font-medium">Spending category</span>
          <span className="text-xs text-muted-foreground">
            Group expenses, like Fuel or Rent.
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
