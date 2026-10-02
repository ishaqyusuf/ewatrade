import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { PrescriptionRequestStatus } from "@ewatrade/prescriptions/schemas"
import { Badge } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"
import { PrescriptionActionsMenu } from "./actions-menu"

export type PrescriptionQueueRow =
  RouterOutputs["prescriptions"]["queue"]["data"][number]

function label(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

const statusTone: Record<string, string> = {
  attendant_verification: "bg-amber-100 text-amber-950",
  converted: "bg-emerald-100 text-emerald-950",
  declined: "bg-red-100 text-red-950",
  media_review: "bg-blue-100 text-blue-950",
  needs_clarification: "bg-amber-100 text-amber-950",
  needs_clearer_media: "bg-amber-100 text-amber-950",
  pharmacist_review: "bg-violet-100 text-violet-950",
  quoted: "bg-cyan-100 text-cyan-950",
  ready_to_quote: "bg-emerald-100 text-emerald-950",
  transcribing: "bg-blue-100 text-blue-950",
}

export function createPrescriptionColumns(
  timeZone: string,
  open: (id: string, status: PrescriptionRequestStatus) => void,
): ColumnDef<PrescriptionQueueRow>[] {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  })

  return [
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
        className: "z-20 bg-background md:sticky",
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
        <Badge
          className={`rounded-full ${statusTone[row.original.status] ?? ""}`}
        >
          {label(row.original.status)}
        </Badge>
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
          {label(row.original.source)}
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
          {label(row.original.fulfilmentPreference)}
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
          {dateFormatter.format(row.original.createdAt)}
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
