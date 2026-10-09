"use client"
import {
  type WorkJob,
  formatDue,
  label,
  tone,
} from "@/components/service-work/service-utils"
import { selectColumn } from "@/components/tables/core"
import { Badge, Button } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"

export function getServiceWorkAssignment(job: WorkJob) {
  return job.priority === "urgent"
    ? "Urgent"
    : job.currentAssigneeUserId
      ? "Assigned"
      : "Unassigned"
}

export function ServiceWorkStatusBadge({ job }: { job: WorkJob }) {
  return (
    <Badge className={`capitalize ${tone(job.summary)}`}>
      {label(job.summary)}
    </Badge>
  )
}

export function createServiceWorkColumns(
  openJob: (jobId: string) => void,
  timeZone: string,
): ColumnDef<WorkJob>[] {
  return [
    selectColumn((job) => `job ${job.orderNumber}`),
    {
      id: "order",
      size: 280,
      minSize: 180,
      maxSize: 420,
      enableHiding: false,
      meta: {
        headerLabel: "Order",
        sticky: true,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-focus-visible:bg-muted/40 group-aria-selected:bg-muted/60",
        reorderable: false,
        skeleton: { type: "text" },
      },
      cell: ({ row }) => (
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full truncate text-left font-medium hover:underline focus-visible:underline"
            onClick={() => openJob(row.original.id)}
          >
            {row.original.orderNumber}
          </button>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.lines.map((line) => line.catalogItemName).join(", ")}
          </p>
        </div>
      ),
    },
    {
      id: "work",
      size: 100,
      minSize: 80,
      maxSize: 160,
      meta: { headerLabel: "Work", skeleton: { type: "text" } },
      cell: ({ row }) =>
        `${row.original.lines.length} line${row.original.lines.length === 1 ? "" : "s"}`,
    },
    {
      id: "assignment",
      size: 150,
      minSize: 120,
      maxSize: 240,
      meta: {
        headerLabel: "Assignment",
        sortField: "priority",
        skeleton: { type: "text" },
      },
      cell: ({ row }) => getServiceWorkAssignment(row.original),
    },
    {
      id: "due",
      size: 220,
      minSize: 160,
      maxSize: 320,
      meta: { headerLabel: "Promised", skeleton: { type: "text" } },
      cell: ({ row }) => formatDue(row.original.dueCommitmentAt, timeZone),
    },
    {
      id: "createdAt",
      size: 220,
      minSize: 160,
      maxSize: 320,
      meta: {
        headerLabel: "Created",
        sortField: "createdAt",
        skeleton: { type: "text" },
      },
      cell: ({ row }) => formatDue(row.original.createdAt, timeZone),
    },
    {
      id: "status",
      size: 180,
      minSize: 150,
      maxSize: 260,
      meta: { headerLabel: "Status", skeleton: { type: "badge" } },
      cell: ({ row }) => <ServiceWorkStatusBadge job={row.original} />,
    },
    {
      id: "actions",
      size: 80,
      minSize: 80,
      maxSize: 80,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Actions",
        sticky: true,
        className: "z-20 bg-background group-hover:bg-muted/40",
        reorderable: false,
        skeleton: { type: "icon" },
      },
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Open job ${row.original.orderNumber}`}
          onClick={() => openJob(row.original.id)}
        >
          Open
        </Button>
      ),
    },
  ]
}
