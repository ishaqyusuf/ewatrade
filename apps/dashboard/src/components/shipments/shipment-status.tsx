import { Badge, cn } from "@ewatrade/ui"
import {
  SHIPMENT_STATUS_LABELS,
  type ShipmentStatus,
} from "@ewatrade/utils/shipments"

const statusTone: Record<ShipmentStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  EXPECTED: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  PARTIALLY_RECEIVED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  RECEIVED: "bg-primary/10 text-primary",
  CLOSED_SHORT: "bg-muted text-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
}

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <Badge className={cn("rounded-full border-0", statusTone[status])}>
      {SHIPMENT_STATUS_LABELS[status]}
    </Badge>
  )
}
