"use client"

import { FinanceBankStatementDataTable } from "@/components/tables/finance-bank-statements/data-table"
import { useFinanceParams } from "@/hooks/use-finance-params"
import type { TableSettings } from "@/utils/table-settings"
import { SelectControl } from "@ewatrade/ui"
import type { FinanceBook } from "./types"

export function FinanceBankStatements({
  book,
  initialTableSettings,
}: { book: FinanceBook; initialTableSettings?: TableSettings }) {
  const { bankAccountId, setParams } = useFinanceParams()
  const accounts = book.accounts.filter(
    (account) =>
      account.kind === "ASSET" &&
      ["BANK", "CLEARING"].includes(account.purpose),
  )
  return (
    <section className="grid min-w-0 gap-5">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Compare original bank statements with posted money records. Imported
        transactions remain separate evidence; balances and payments stay tied
        to their original records.
      </p>
      <SelectControl
        aria-label="Filter bank statements by account"
        className="w-full sm:w-72"
        value={bankAccountId}
        options={[
          { value: "", label: "All bank accounts" },
          ...accounts.map((account) => ({
            value: account.id,
            label: `${account.name}${account.archivedAt ? " (archived)" : ""}`,
          })),
        ]}
        onValueChange={(value) =>
          void setParams({ bankAccountId: value || null })
        }
      />
      <FinanceBankStatementDataTable
        key={`${book.id}:${bankAccountId}`}
        book={book}
        initialSettings={initialTableSettings}
      />
    </section>
  )
}
