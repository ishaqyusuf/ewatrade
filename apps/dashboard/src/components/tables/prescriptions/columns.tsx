import { formatWhen } from "@/components/service-work/service-utils"
import { selectColumn } from "@/components/tables/core"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { PrescriptionRequestStatus } from "@ewatrade/prescriptions/schemas"
import { Badge } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"
import { PrescriptionActionsMenu } from "./actions-menu"

export type PrescriptionQueueRow =
  RouterOutputs["prescriptions"]["queue"]["data"][number]

/** Plain words for prescription statuses, channels and fulfilment. */
const PLAIN_LABELS: Record<string, string> = {
  attendant_verification: "Attendant check",
  converted: "Order made",
  declined: "Declined",
  expired: "Expired",
  media_review: "Check photo",
  needs_clarification: "Asked customer",
  needs_clearer_media: "Needs clearer photo",
  pharmacist_review: "Pharmacist check",
  quoted: "Price sent",
  ready_to_quote: "Ready to price",
  received: "New",
  transcribing: "Typing up",
  withdrawn: "Withdrawn",
  staff_phone: "Phone",
  staff_walk_in: "Walk-in",
  web: "Website",
  whatsapp: "WhatsApp",
  delivery: "Delivery",
  pickup: "Pickup",
  unspecified: "Not chosen",
}

export function prescriptionLabel(value: string) {
  const key = value.toLowerCase()
  return (
    PLAIN_LABELS[key] ??
    key
      .split("_")
      .map((word, index) =>
        index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
      )
      .join(" ")
  )
}

const statusTone: Record<string, string> = {
  attendant_verification: "bg-warning text-warning-foreground",
  converted: "bg-success text-success-foreground",
  declined: "bg-danger text-danger-foreground",
  media_review: "bg-info text-info-foreground",
  needs_clarification: "bg-warning text-warning-foreground",
  needs_clearer_media: "bg-warning text-warning-foreground",
  pharmacist_review: "bg-highlight text-highlight-foreground",
  quoted: "bg-cyan-100 text-cyan-950",
  ready_to_quote: "bg-success text-success-foreground",
  transcribing: "bg-info text-info-foreground",
}

export function PrescriptionStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={`rounded-full ${statusTone[status] ?? ""}`}>
      {prescriptionLabel(status)}
    </Badge>
  )
}

export function createPrescriptionDateFormatter(timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  })
}

export function createPrescriptionColumns(
  timeZone: string,
  open: (id: string, status: PrescriptionRequestStatus) => void,
): ColumnDef<PrescriptionQueueRow>[] {
  return [
    selectColumn((request) => `prescription ${request.reference}`),
    {
      accessorKey: "reference",
      header: "Reference",
      size: 170,
      minSize: 140,
      maxSize: 260,
      enableHiding: false,
      meta: {
        headerLabel: "Reference",
        sortField: "reference",
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
        skeleton: { type: "text" as const, width: "w-28" },
      },
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {row.original.reference}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 190,
      minSize: 150,
      maxSize: 260,
      meta: {
        headerLabel: "Status",
        sortField: "status",
        skeleton: { type: "badge" as const, width: "w-28" },
      },
      cell: ({ row }) => (
        <PrescriptionStatusBadge status={row.original.status} />
      ),
    },
    {
      accessorKey: "source",
      header: "Channel",
      size: 150,
      minSize: 120,
      maxSize: 200,
      meta: {
        headerLabel: "Channel",
        sortField: "source",
        skeleton: { type: "text" as const, width: "w-24" },
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {prescriptionLabel(row.original.source)}
        </span>
      ),
    },
    {
      accessorKey: "fulfilmentPreference",
      header: "Fulfilment",
      size: 160,
      minSize: 130,
      maxSize: 220,
      meta: {
        headerLabel: "Fulfilment",
        skeleton: { type: "text" as const, width: "w-24" },
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {prescriptionLabel(row.original.fulfilmentPreference)}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Received",
      size: 190,
      minSize: 160,
      maxSize: 240,
      meta: {
        headerLabel: "Received",
        sortField: "created_at",
        skeleton: { type: "text" as const, width: "w-32" },
      },
      cell: ({ row }) => (
        <time dateTime={row.original.createdAt.toISOString()}>
          {formatWhen(row.original.createdAt, timeZone)}
        </time>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 90,
      minSize: 90,
      maxSize: 90,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Actions",
        sticky: true,
        reorderable: false,
        className: "z-20 border-l bg-background md:sticky",
        skeleton: { type: "icon" as const },
      },
      cell: ({ row }) => (
        <PrescriptionActionsMenu
          requestId={row.original.id}
          status={row.original.status}
          onOpen={open}
        />
      ),
    },
  ]
}
