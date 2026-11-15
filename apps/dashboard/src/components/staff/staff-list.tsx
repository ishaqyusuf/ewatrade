"use client"

import {
  type StaffMemberRow,
  type StaffStatusKey,
  getStaffAccessLine,
  getStaffContact,
  getStaffDisplayName,
  getStaffStatusKey,
  staffStatusKeyLabels,
} from "@/lib/staff-management"
import { cn } from "@ewatrade/ui"

export function staffInitials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .trim()
    .split(/\s+/)
  return `${words[0]?.[0] ?? "?"}${words[1]?.[0] ?? ""}`.toUpperCase()
}

const STATUS_CHIP: Record<StaffStatusKey, string | null> = {
  active: null,
  invited: "bg-info text-info-foreground",
  expired: "bg-warning text-warning-foreground",
  cancelled: "bg-neutral text-neutral-foreground",
  suspended: "bg-danger text-danger-foreground",
}

/** Invited, Invite expired or Suspended; nothing for people who are active. */
export function StaffStatusChip({ member }: { member: StaffMemberRow }) {
  const key = getStaffStatusKey(member)
  const tone = STATUS_CHIP[key]
  if (!tone) return null
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        tone,
      )}
    >
      {staffStatusKeyLabels[key]}
    </span>
  )
}

/**
 * Everyone in one list: name, role and stores in plain words, and a chip
 * only when they are not active. A row opens the person's sheet.
 */
export function StaffList({
  rows,
  onOpen,
}: {
  rows: StaffMemberRow[]
  onOpen?: (member: StaffMemberRow) => void
}) {
  return (
    <ul
      aria-label="Staff"
      className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      {rows.map((member) => {
        const name = getStaffDisplayName(member)
        const body = (
          <>
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--avatar)] text-sm font-semibold text-[var(--avatar-foreground)]"
            >
              {staffInitials(name)}
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-base font-medium">{name}</span>
              <span className="truncate text-sm text-muted-foreground">
                {getStaffAccessLine(member)}
              </span>
            </span>
            <span className="hidden min-w-0 max-w-64 truncate text-sm text-muted-foreground lg:block">
              {getStaffContact(member.user.email)}
            </span>
            <StaffStatusChip member={member} />
          </>
        )
        const rowClass =
          "flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left"
        return (
          <li key={member.id}>
            {onOpen ? (
              <button
                type="button"
                className={cn(
                  rowClass,
                  "transition-colors hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]",
                )}
                onClick={() => onOpen(member)}
              >
                {body}
              </button>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
