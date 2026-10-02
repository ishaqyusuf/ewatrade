import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"
import { DomainActionsMenu } from "./actions-menu"

export type DomainRow = RouterOutputs["domains"]["list"][number]

function readable(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
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
      cell: ({ row }) => readable(row.original.provider),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Connection",
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === "ACTIVE" ? "default" : "secondary"}
        >
          {readable(row.original.status)}
        </Badge>
      ),
    },
    {
      id: "expiresAt",
      accessorKey: "expiresAt",
      header: "Renewal / expiry",
      cell: ({ row }) =>
        row.original.expiresAt
          ? new Date(row.original.expiresAt).toLocaleDateString()
          : "External",
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
