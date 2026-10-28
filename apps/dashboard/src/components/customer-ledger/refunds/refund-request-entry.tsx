"use client"
import { useTRPC } from "@/trpc/client"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

/**
 * Where a new refund request starts. On a customer's statement it's offered
 * only when the current account read shows paid-ahead money that isn't held;
 * a failed read says so instead of looking like nothing to return. Without a
 * customer, it points to their statement.
 */
export function RefundRequestEntry({
  accountId,
  busy,
  onStart,
}: {
  accountId?: string
  busy: boolean
  onStart: () => void
}) {
  if (!accountId)
    return (
      <p className="text-sm text-muted-foreground">
        To record a new refund request, open the customer’s statement from{" "}
        <Link href="/customers" className="underline underline-offset-4">
          Customers
        </Link>
        .
      </p>
    )
  return <AccountEntry accountId={accountId} busy={busy} onStart={onStart} />
}

function AccountEntry({
  accountId,
  busy,
  onStart,
}: {
  accountId: string
  busy: boolean
  onStart: () => void
}) {
  const trpc = useTRPC()
  const account = useQuery(
    trpc.customerLedger.accountDetail.queryOptions(
      { accountId },
      { retry: false },
    ),
  )
  // Checking isn't the same as nothing to return.
  if (account.status === "pending")
    return (
      <output aria-busy="true" className="text-sm text-muted-foreground">
        Checking paid-ahead money…
      </output>
    )
  if (account.status === "error")
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          Couldn’t check this customer’s paid-ahead money for refund requests.
        </AlertDescription>
        <Button
          variant="outline"
          disabled={account.isFetching}
          onClick={() => void account.refetch()}
        >
          Try again
        </Button>
      </Alert>
    )
  const available = BigInt(account.data.totals.availableCreditMinor)
  // No book or nothing paid ahead now: there's nothing to request back.
  if (!account.data.book || available <= BigInt(0)) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-border px-4 py-3 text-sm">
      <span>
        {formatFinanceMoney(
          account.data.totals.availableCreditMinor,
          account.data.currencyCode,
        )}{" "}
        paid ahead and not held. A customer can ask for it back.
      </span>
      <Button variant="outline" disabled={busy} onClick={onStart}>
        New refund request
      </Button>
    </div>
  )
}
