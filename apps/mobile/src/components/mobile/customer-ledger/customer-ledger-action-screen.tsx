import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { CustomerLedgerCommandForm } from "./customer-ledger-command-form"
import { CustomerLedgerEntryDetail } from "./customer-ledger-entry-detail"
import { CustomerLedgerGate } from "./customer-ledger-gate"
import type { CustomerLedgerMode } from "./types"
const modes: CustomerLedgerMode[] = [
  "opening",
  "receipt",
  "apply",
  "entry",
  "release",
  "refund",
  "reverse",
]
export function CustomerLedgerActionScreen(props: {
  accountId: string
  mode: string
  entryId?: string
  allocationId?: string
  allocationAfter?: string
}) {
  return (
    <CustomerLedgerGate>
      {(scope) => (
        <Action
          key={`${scope.actorUserId}:${scope.tenantId}:${props.accountId}:${props.mode}:${props.entryId}:${props.allocationId}`}
          {...scope}
          {...props}
        />
      )}
    </CustomerLedgerGate>
  )
}
function Action({
  actorUserId,
  tenantId,
  accountId,
  mode,
  entryId,
  allocationId,
  allocationAfter,
}: {
  actorUserId: string
  tenantId: string
  accountId: string
  mode: string
  entryId?: string
  allocationId?: string
  allocationAfter?: string
}) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.customerLedger.accountDetail.queryOptions(
      { accountId },
      { retry: false },
    ),
  )
  if (!modes.includes(mode as CustomerLedgerMode))
    return (
      <StatusBanner
        message="Choose a supported customer ledger action."
        tone="warning"
      />
    )
  if (query.isPending)
    return <Text className="px-4">Loading customer account…</Text>
  if (query.isError)
    return (
      <StatusBanner
        message={query.error.message}
        tone="destructive"
        actionLabel="Try again"
        onActionPress={() => void query.refetch()}
      />
    )
  if (mode === "entry")
    return entryId ? (
      <CustomerLedgerEntryDetail account={query.data} entryId={entryId} />
    ) : (
      <StatusBanner message="Choose an entry from the statement." />
    )
  if (!query.data.book)
    return (
      <StatusBanner message="Start a matching currency book on the dashboard before recording customer activity." />
    )
  return (
    <CustomerLedgerCommandForm
      account={query.data}
      actorUserId={actorUserId}
      tenantId={tenantId}
      mode={mode as Exclude<CustomerLedgerMode, "entry">}
      entryId={entryId}
      allocationId={allocationId}
      allocationAfter={allocationAfter}
    />
  )
}
