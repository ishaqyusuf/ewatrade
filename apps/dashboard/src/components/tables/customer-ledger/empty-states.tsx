"use client"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"
import { Button } from "@ewatrade/ui"
export function CustomerLedgerEmptyState({
  customerName,
  onRecordPayment,
  onStartingBalance,
}: {
  customerName?: string
  onRecordPayment?: () => void
  onStartingBalance?: () => void
}) {
  useDashboardEmptyState("customer-ledger")
  const who = customerName?.split(" ")[0] || "they"
  return (
    <div className="grid min-h-40 place-items-center border border-border px-4 py-8 text-center">
      <div className="grid justify-items-center gap-1">
        <p className="font-medium">No payments or charges yet</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {onRecordPayment
            ? `Record a payment, or add what ${who} owed before you started using ewatrade.`
            : "Payments and charges show up here once Finance is set up."}
        </p>
        {onRecordPayment || onStartingBalance ? (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {onRecordPayment ? (
              <Button onClick={onRecordPayment}>Record payment</Button>
            ) : null}
            {onStartingBalance ? (
              <Button variant="outline" onClick={onStartingBalance}>
                Add starting balance
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
