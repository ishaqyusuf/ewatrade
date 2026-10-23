"use client"

import {
  type WorkJob,
  formatWhen,
  jobWhat,
} from "@/components/service-work/service-utils"
import {
  type CollectionView,
  DirectoryCollection,
  DirectoryRecord,
} from "@/components/tables/core"
import type { Row } from "@tanstack/react-table"
import {
  type ServiceWorkColumnActions,
  ServiceWorkDue,
  ServiceWorkMoney,
  ServiceWorkRowActions,
  ServiceWorkStatusMenu,
  getServiceWorkAssignment,
} from "./columns"

export function ServiceWorkCollection({
  rows,
  view,
  timeZone,
  actions,
}: {
  rows: Row<WorkJob>[]
  view: CollectionView
  timeZone: string
  actions: ServiceWorkColumnActions
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
            title={job.customerName || "Walk-in customer"}
            onOpen={() => actions.openJob(job.id)}
            description={`${job.orderNumber} · ${jobWhat(job)}`}
            badges={<ServiceWorkStatusMenu job={job} actions={actions} />}
            details={[
              {
                label: "Who",
                value: getServiceWorkAssignment(job, actions.assigneeName),
              },
              {
                label: "Due",
                value: <ServiceWorkDue job={job} timeZone={timeZone} />,
              },
              { label: "Money", value: <ServiceWorkMoney job={job} /> },
              { label: "Added", value: formatWhen(job.createdAt, timeZone) },
            ]}
            actions={<ServiceWorkRowActions job={job} actions={actions} />}
          />
        )
      })}
    </DirectoryCollection>
  )
}
