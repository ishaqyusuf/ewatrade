import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { AccountMessageScreen } from "./account-message"
import { CustomerLedgerCommandForm } from "./customer-ledger-command-form"
import { CustomerLedgerEntryDetail } from "./customer-ledger-entry-detail"
import { CustomerLedgerGate } from "./customer-ledger-gate"
import { CustomerRefundDetail } from "./customer-refund-detail"
import { CustomerRefundRequestForm } from "./customer-refund-request-form"
import { CustomerRefundRequests } from "./customer-refund-requests"
import { EarlierOrdersScreen } from "./earlier-orders"
import type { CustomerLedgerCommandMode, CustomerLedgerMode } from "./types"
const modes: CustomerLedgerMode[] = [
  "opening",
  "receipt",
  "apply",
  "entry",
  "release",
  "refund",
  "reverse",
  "refund-requests",
  "refund-request",
  "request-refund",
  "remind",
  "summary",
  "link",
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
  if (mode === "remind" || mode === "summary")
    return <AccountMessageScreen accountId={accountId} initialKind={mode} />
  if (mode === "link")
    return <EarlierOrdersScreen customerId={query.data.customer.id} />
  if (!query.data.book)
    return (
      <StatusBanner message="Start a matching currency book on the dashboard before recording customer activity." />
    )
  if (mode === "refund-requests")
    return <CustomerRefundRequests account={query.data} />
  // Adapter: on this shared route `entryId` carries the refund request id.
  if (mode === "refund-request")
    return entryId ? (
      <CustomerRefundDetail
        account={query.data}
        actorUserId={actorUserId}
        tenantId={tenantId}
        requestId={entryId}
      />
    ) : (
      <StatusBanner message="Choose a refund request from the list." />
    )
  if (mode === "request-refund")
    return (
      <CustomerRefundRequestForm
        account={query.data}
        actorUserId={actorUserId}
        tenantId={tenantId}
      />
    )
  return (
    <CustomerLedgerCommandForm
      account={query.data}
      actorUserId={actorUserId}
      tenantId={tenantId}
      mode={mode as CustomerLedgerCommandMode}
      entryId={entryId}
      allocationId={allocationId}
      allocationAfter={allocationAfter}
    />
  )
}
