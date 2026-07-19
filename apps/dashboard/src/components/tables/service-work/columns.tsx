import {
  type WorkJob,
  formatDue,
  label,
  tone,
} from "@/components/service-work/service-utils"
import { Badge, Button } from "@ewatrade/ui"
import type { ReactNode } from "react"

export type ServiceWorkColumn = {
  header: string
  key: string
  render: (job: WorkJob) => ReactNode
}

export function createServiceWorkColumns(
  openJob: (jobId: string) => void,
  timeZone: string,
): ServiceWorkColumn[] {
  return [
    {
      header: "Order",
      key: "order",
      render: (job) => (
        <div>
          <p className="font-medium">{job.orderNumber}</p>
          <p className="text-xs text-muted-foreground">
            {job.lines.map((line) => line.catalogItemName).join(", ")}
          </p>
        </div>
      ),
    },
    {
      header: "Work",
      key: "work",
      render: (job) => (
        <span className="text-muted-foreground">
          {job.lines.length} line{job.lines.length === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      header: "Assignment",
      key: "assignment",
      render: (job) => (
        <span className="text-muted-foreground">
          {job.priority === "urgent"
            ? "Urgent"
            : job.currentAssigneeUserId
              ? "Assigned"
              : "Unassigned"}
        </span>
      ),
    },
    {
      header: "Promised",
      key: "due",
      render: (job) => (
        <span className="text-muted-foreground">
          {formatDue(job.dueCommitmentAt, timeZone)}
        </span>
      ),
    },
    {
      header: "Status",
      key: "status",
      render: (job) => (
        <Badge className={`rounded-full capitalize ${tone(job.summary)}`}>
          {label(job.summary)}
        </Badge>
      ),
    },
    {
      header: "",
      key: "actions",
      render: (job) => (
        <Button size="sm" variant="ghost" onClick={() => openJob(job.id)}>
          Open
        </Button>
      ),
    },
  ]
}
