import { OpenFinanceSheet } from "@/components/finance/open-finance-sheet"
export function ExpenseEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="grid justify-items-center gap-3 border-y border-border py-16 text-center">
      <h3 className="font-medium">
        {filtered ? "No matching expenses" : "Your spending record starts here"}
      </h3>
      <p className="max-w-md text-sm text-muted-foreground">
        {filtered
          ? "Change the search or payment-status filter to see more records."
          : "Record what you spent, who you paid and any amount still owed."}
      </p>
      {!filtered ? (
        <OpenFinanceSheet mode="expense">Record an expense</OpenFinanceSheet>
      ) : null}
    </div>
  )
}
