import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"

import { DomainActionsMenu } from "./actions-menu"

export type DomainRow = RouterOutputs["domains"]["list"][number]

function readable(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

export function domainColumns(onManage: (domain: DomainRow) => void) {
  return [
    {
      header: "Domain",
      key: "domain",
      render: (domain: DomainRow) => (
        <div>
          <p className="font-medium">{domain.hostname}</p>
          {domain.isPrimary ? (
            <p className="mt-1 text-xs text-muted-foreground">Primary</p>
          ) : null}
        </div>
      ),
    },
    {
      header: "Store",
      key: "store",
      render: (domain: DomainRow) => domain.store.name,
    },
    {
      header: "Registrar",
      key: "provider",
      render: (domain: DomainRow) => readable(domain.provider),
    },
    {
      header: "Connection",
      key: "status",
      render: (domain: DomainRow) => (
        <Badge variant={domain.status === "ACTIVE" ? "default" : "secondary"}>
          {readable(domain.status)}
        </Badge>
      ),
    },
    {
      header: "Renewal / expiry",
      key: "expiry",
      render: (domain: DomainRow) =>
        domain.expiresAt
          ? new Date(domain.expiresAt).toLocaleDateString()
          : "External",
    },
    {
      className: "text-right",
      header: "",
      key: "actions",
      render: (domain: DomainRow) => (
        <DomainActionsMenu domain={domain} onManage={onManage} />
      ),
    },
  ]
}
