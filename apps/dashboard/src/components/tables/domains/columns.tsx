import { selectColumn } from "@/components/tables/core"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"
import { DomainActionsMenu } from "./actions-menu"

export type DomainRow = RouterOutputs["domains"]["list"][number]

export function readableDomainValue(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

export function DomainStatusBadge({ domain }: { domain: DomainRow }) {
  return (
    <Badge variant={domain.status === "ACTIVE" ? "default" : "secondary"}>
      {readableDomainValue(domain.status)}
    </Badge>
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
      cell: ({ row }) => <DomainStatusBadge domain={row.original} />,
    },
    {
      id: "expiresAt",
      accessorKey: "expiresAt",
      header: "Renewal / expiry",
      cell: ({ row }) => formatDomainExpiry(row.original),
    },
    {
      id: "actions",
      enableSorting: false,
      header: "Actions",
      cell: ({ row }) => (
        <DomainActionsMenu domain={row.original} onManage={onManage} />
      ),
    },
  ]
}
