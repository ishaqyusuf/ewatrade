import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"

import { PrescriptionActionsMenu } from "./actions-menu"
import { PrescriptionSortableHeader } from "./table-header"

export type PrescriptionQueueRow =
  RouterOutputs["prescriptions"]["queue"]["data"][number]

export type PrescriptionColumn = {
  className?: string
  header: React.ReactNode
  key: string
  render: (request: PrescriptionQueueRow) => React.ReactNode
}

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
): PrescriptionColumn[] {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  })
  return [
    {
      header: (
        <PrescriptionSortableHeader field="reference" label="Reference" />
      ),
      key: "reference",
      render: (request) => (
        <span className="font-medium tabular-nums">{request.reference}</span>
      ),
    },
    {
      header: <PrescriptionSortableHeader field="status" label="Status" />,
      key: "status",
      render: (request) => (
        <Badge className={`rounded-full ${statusTone[request.status] ?? ""}`}>
          {label(request.status)}
        </Badge>
      ),
    },
    {
      header: <PrescriptionSortableHeader field="source" label="Channel" />,
      key: "source",
      render: (request) => (
        <span className="text-muted-foreground">{label(request.source)}</span>
      ),
    },
    {
      header: "Fulfilment",
      key: "fulfilment",
      render: (request) => (
        <span className="text-muted-foreground">
          {label(request.fulfilmentPreference)}
        </span>
      ),
    },
    {
      header: (
        <PrescriptionSortableHeader field="created_at" label="Received" />
      ),
      key: "received",
      render: (request) => (
        <time dateTime={request.createdAt.toISOString()}>
          {dateFormatter.format(request.createdAt)}
        </time>
      ),
    },
    {
      className: "w-24 text-right",
      header: "Actions",
      key: "actions",
      render: (request) => <PrescriptionActionsMenu requestId={request.id} />,
    },
  ]
}
