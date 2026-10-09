"use client"

import {
  type WorkJob,
  formatDue,
} from "@/components/service-work/service-utils"
import {
  type CollectionView,
  DirectoryCollection,
  DirectoryRecord,
} from "@/components/tables/core"
import { Button } from "@ewatrade/ui"
import type { Row } from "@tanstack/react-table"
import { ServiceWorkStatusBadge, getServiceWorkAssignment } from "./columns"

export function ServiceWorkCollection({
  rows,
  view,
  timeZone,
  openJob,
}: {
  rows: Row<WorkJob>[]
  view: CollectionView
  timeZone: string
  openJob: (jobId: string) => void
}) {
  return (
    <DirectoryCollection view={view} label="Service job">
      {rows.map((row) => {
        const job = row.original
        return (
          <DirectoryRecord
            key={row.id}
            row={row}
            view={view}
            selectLabel={`Select job ${job.orderNumber}`}
            title={job.orderNumber}
            onOpen={() => openJob(job.id)}
            description={job.lines
              .map((line) => line.catalogItemName)
              .join(", ")}
            badges={<ServiceWorkStatusBadge job={job} />}
            details={[
              {
                label: "Work",
                value: `${job.lines.length} line${job.lines.length === 1 ? "" : "s"}`,
              },
              { label: "Assignment", value: getServiceWorkAssignment(job) },
              {
                label: "Promised",
                value: formatDue(job.dueCommitmentAt, timeZone),
              },
              { label: "Created", value: formatDue(job.createdAt, timeZone) },
            ]}
            actions={
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Open job ${job.orderNumber}`}
                onClick={() => openJob(job.id)}
              >
                Open
              </Button>
            }
          />
        )
      })}
    </DirectoryCollection>
  )
}
