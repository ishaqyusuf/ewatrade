"use client"

import { RowSelectCheckbox } from "@/components/tables/core"
import {
  type StaffMemberRow,
  getStaffDisplayName,
  getStaffRoleLabel,
} from "@/lib/staff-management"
import type { Row } from "@tanstack/react-table"
import { StaffActionsMenu, type StaffRowActions } from "./actions"
import {
  StaffAvatar,
  StaffName,
  StaffStatus,
  formatStaffDate,
  staffStatusDetail,
  staffStoresText,
} from "./format"

type CollectionProps = {
  rows: Row<StaffMemberRow>[]
  actions: StaffRowActions
}

/** One bordered panel with a single-line row per person; extras hide on phones. */
function StaffList({ rows, actions }: CollectionProps) {
  return (
    <ul aria-label="Staff list" className="divide-y rounded-lg border">
      {rows.map((row) => {
        const member = row.original
        return (
          <li
            key={row.id}
            data-state={row.getIsSelected() ? "selected" : undefined}
            className="grid grid-cols-[1rem_1.75rem_minmax(0,1fr)_auto_2rem] items-center gap-3 px-3 py-2.5 data-[state=selected]:bg-muted md:grid-cols-[1rem_1.75rem_minmax(0,1fr)_6rem_9rem_8rem_2rem]"
          >
            <RowSelectCheckbox
              row={row}
              label={`Select ${getStaffDisplayName(member)}`}
            />
            <StaffAvatar member={member} className="size-7" />
            <div className="flex min-w-0 items-baseline gap-2">
              <StaffName member={member} onOpen={actions.onOpen} />
              <span className="truncate text-sm text-muted-foreground max-md:hidden">
                {member.user.email}
              </span>
            </div>
            <span className="truncate text-sm text-muted-foreground max-md:hidden">
              {getStaffRoleLabel(member.role)}
            </span>
            <span className="truncate text-sm text-muted-foreground max-md:hidden">
              {staffStoresText(member)}
            </span>
            <StaffStatus member={member} showDetail={false} />
            <StaffActionsMenu member={member} actions={actions} />
          </li>
        )
      })}
    </ul>
  )
}

/** Grid columns are fixed by screen width: 1, then 2 at md, 3 at lg, 4 at xl. */
function StaffGrid({ rows, actions }: CollectionProps) {
  return (
    <ul
      aria-label="Staff grid"
      className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {rows.map((row) => {
        const member = row.original
        const detail = staffStatusDetail(member)
        return (
          <li key={row.id} className="min-w-0">
            <article
              data-state={row.getIsSelected() ? "selected" : undefined}
              className="flex h-full flex-col gap-2.5 rounded-xl border bg-card p-3 data-[state=selected]:border-transparent data-[state=selected]:ring-2 data-[state=selected]:ring-primary"
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
                <StaffAvatar member={member} />
                <div className="grid min-w-0">
                  <StaffName member={member} onOpen={actions.onOpen} />
                  <span className="truncate text-sm text-muted-foreground">
                    {getStaffRoleLabel(member.role)} · {staffStoresText(member)}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <RowSelectCheckbox
                    row={row}
                    label={`Select ${getStaffDisplayName(member)}`}
                  />
                  <StaffActionsMenu member={member} actions={actions} />
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2">
                <StaffStatus member={member} showDetail={false} />
                <span className="truncate text-sm text-muted-foreground">
                  {detail ??
                    (member.acceptedAt
                      ? `Joined ${formatStaffDate(member.acceptedAt)}`
                      : "")}
                </span>
              </div>
            </article>
          </li>
        )
      })}
    </ul>
  )
}

export function StaffCollection({
  view,
  ...props
}: CollectionProps & { view: "list" | "cards" }) {
  return view === "cards" ? <StaffGrid {...props} /> : <StaffList {...props} />
}
