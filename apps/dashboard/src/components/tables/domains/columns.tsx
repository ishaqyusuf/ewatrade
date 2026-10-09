import { selectColumn } from "@/components/tables/core"
import type { DomainConnectionStatus } from "@/hooks/use-domain-filter-params"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ColumnDef } from "@tanstack/react-table"
import { DomainActionsMenu } from "./actions-menu"

export type DomainRow = RouterOutputs["domains"]["list"][number]

export function readableDomainValue(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

const domainStatusLabels: Record<DomainConnectionStatus, string> = {
  OWNERSHIP_PENDING: "Ownership pending",
  DNS_CONFIGURING: "Configuring DNS",
  VERIFYING: "Verifying",
  ACTIVE: "Active",
  FAILED: "Failed",
  DISCONNECTED: "Disconnected",
}

// Reuses the order status dot tokens where the meaning matches: live is
// "completed" green, anything still in progress is "pending" amber, and a
// failed connection is "refunded" rose. Disconnected stays neutral.
const domainStatusDots: Record<DomainConnectionStatus, string> = {
  OWNERSHIP_PENDING: "var(--status-pending-dot)",
  DNS_CONFIGURING: "var(--status-pending-dot)",
  VERIFYING: "var(--status-pending-dot)",
  ACTIVE: "var(--status-completed-dot)",
  FAILED: "var(--status-refunded-dot)",
  DISCONNECTED: "var(--muted-foreground)",
}

function isDomainConnectionStatus(
  status: string,
): status is DomainConnectionStatus {
  return status in domainStatusLabels
}

export function domainStatusLabel(status: string) {
  return isDomainConnectionStatus(status)
    ? domainStatusLabels[status]
    : readableDomainValue(status)
}

/** Connection state as a coloured dot plus label, matching order statuses. */
export function DomainStatusDot({ domain }: { domain: DomainRow }) {
  const status = domain.status
  const color = isDomainConnectionStatus(status)
    ? domainStatusDots[status]
    : "var(--muted-foreground)"
  return (
    <span
      data-slot="domain-status"
      data-status={status}
      className="inline-flex items-center gap-2 text-sm whitespace-nowrap"
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span>{domainStatusLabel(status)}</span>
    </span>
  )
}

export function formatDomainExpiry(domain: DomainRow) {
  return domain.expiresAt
    ? new Date(domain.expiresAt).toLocaleDateString()
    : "External"
}

export function domainColumns(
  onManage: (domain: DomainRow) => void,
): ColumnDef<DomainRow>[] {
  return [
    selectColumn((domain) => domain.hostname, "Select all listed domains"),
    {
      id: "hostname",
      accessorKey: "hostname",
      header: "Domain",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.hostname}</p>
          {row.original.isPrimary ? (
            <p className="mt-1 text-xs text-muted-foreground">Primary</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "storeName",
      accessorFn: (domain) => domain.store.name,
      header: "Store",
      cell: ({ row }) => row.original.store.name,
    },
    {
      id: "provider",
      accessorKey: "provider",
      header: "Registrar",
      cell: ({ row }) => readableDomainValue(row.original.provider),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Connection",
      cell: ({ row }) => <DomainStatusDot domain={row.original} />,
    },
    {
      id: "expiresAt",
      accessorKey: "expiresAt",
      header: "Renewal / expiry",
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDomainExpiry(row.original)}
        </span>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      header: "Actions",
      meta: { align: "end" },
      cell: ({ row }) => (
        <DomainActionsMenu domain={row.original} onManage={onManage} />
      ),
    },
  ]
}
