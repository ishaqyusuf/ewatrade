"use client"
import {
  type CustomerLedgerMode,
  useCustomerLedgerParams,
} from "@/hooks/use-customer-ledger-params"
import { useTRPC } from "@/trpc/client"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { AccountMessage } from "./account-message"
import { CustomerLedgerEntryDetail } from "./customer-ledger-entry-detail"
import { EarlierOrdersLink } from "./earlier-orders"
import { CustomerLedgerCommandForm } from "./forms/command-form"
export function CustomerLedgerContent({
  actorUserId,
  tenantId,
  customerId,
  accountId,
  mode,
  entryId,
  allocationId,
}: {
  actorUserId: string
  tenantId: string
  customerId?: string
  accountId: string
  mode: CustomerLedgerMode
  entryId?: string
  allocationId?: string
}) {
  const trpc = useTRPC()
  const { setParams, close } = useCustomerLedgerParams()
  const query = useQuery(
    trpc.customerLedger.accountDetail.queryOptions(
      { accountId },
      { retry: false },
    ),
  )
  if (query.isPending) return <output aria-busy="true">Loading…</output>
  if (query.isError)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          Couldn’t load this customer. Check your connection and try again.
        </AlertDescription>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </Alert>
    )
  if (customerId && query.data.customer.id !== customerId)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          This statement belongs to a different customer.
        </AlertDescription>
      </Alert>
    )
  if (mode === "entry")
    return entryId ? (
      <CustomerLedgerEntryDetail account={query.data} entryId={entryId} />
    ) : (
      <p>Choose an entry on the statement.</p>
    )
  if (mode === "remind" || mode === "summary")
    return (
      <AccountMessage
        accountId={accountId}
        kind={mode}
        onKindChange={(kind) =>
          void setParams({ ledgerAction: kind }, { history: "replace" })
        }
        onDone={() => void close()}
      />
    )
  if (mode === "link")
    return (
      <EarlierOrdersLink
        customerId={query.data.customer.id}
        onDone={() => void close()}
      />
    )
  if (!query.data.book)
    return <p>Set up Finance in this currency before recording payments.</p>
  return (
    <CustomerLedgerCommandForm
      account={query.data}
      actorUserId={actorUserId}
      tenantId={tenantId}
      mode={mode}
      entryId={entryId}
      allocationId={allocationId}
    />
  )
}
