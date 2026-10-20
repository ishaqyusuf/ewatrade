"use client"
import type { CustomerLedgerMode } from "@/hooks/use-customer-ledger-params"
import { useTRPC } from "@/trpc/client"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { CustomerLedgerEntryDetail } from "./customer-ledger-entry-detail"
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
  const query = useQuery(
    trpc.customerLedger.accountDetail.queryOptions(
      { accountId },
      { retry: false },
    ),
  )
  if (query.isPending)
    return <output aria-busy="true">Loading customer account…</output>
  if (query.isError)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>{query.error.message}</AlertDescription>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </Alert>
    )
  if (customerId && query.data.customer.id !== customerId)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          This account is not owned by the selected customer.
        </AlertDescription>
      </Alert>
    )
  if (mode === "entry")
    return entryId ? (
      <CustomerLedgerEntryDetail account={query.data} entryId={entryId} />
    ) : (
      <p>Choose an entry from the statement.</p>
    )
  if (!query.data.book)
    return (
      <p>Start a matching currency book before recording customer activity.</p>
    )
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
