import {
  DOMAIN_STATUS,
  DOMAIN_STATUS_TONE,
  type DomainRow,
  domainBoughtFrom,
  domainRenews,
} from "@/components/domains/domain-status"
import { cn } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"
import { DomainActionsMenu } from "./actions-menu"

export type { DomainRow }

export function DomainStatusBadge({ domain }: { domain: DomainRow }) {
  const status = DOMAIN_STATUS[domain.status]
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        DOMAIN_STATUS_TONE[status.tone],
      )}
    >
      {status.label}
    </span>
  )
}

export function domainColumns(
  onManage: (domain: DomainRow) => void,
): ColumnDef<DomainRow>[] {
  return [
    {
      id: "hostname",
      accessorKey: "hostname",
      header: "Domain",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.hostname}</p>
          {row.original.isPrimary ? (
            <p className="mt-1 text-xs text-muted-foreground">Main address</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "storeName",
      accessorFn: (domain) => domain.store.name,
      header: "Store",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{row.original.store.name}</span>
      ),
    },
    {
      id: "status",
      accessorFn: (domain) => DOMAIN_STATUS[domain.status].label,
      header: "Status",
      cell: ({ row }) => <DomainStatusBadge domain={row.original} />,
    },
    {
      id: "provider",
      accessorFn: (domain) => domainBoughtFrom(domain),
      header: "Bought from",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {domainBoughtFrom(row.original)}
        </span>
      ),
    },
    {
      id: "expiresAt",
      accessorKey: "expiresAt",
      header: "Renews",
      cell: ({ row }) => (
        <span
          className={cn(
            "whitespace-nowrap",
            !row.original.expiresAt && "text-muted-foreground",
          )}
        >
          {domainRenews(row.original)}
        </span>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <DomainActionsMenu domain={row.original} onManage={onManage} />
      ),
    },
  ]
}
