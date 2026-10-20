"use client"
import {
  type StaffMemberRow,
  getStaffDisplayName,
  getStaffRoleLabel,
  getStaffStatusKey,
  staffStatusKeyLabels,
} from "@/lib/staff-management"
import { Avatar, AvatarFallback, Badge, cn } from "@ewatrade/ui"

const dateFormat = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" })
const shortDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
})

export function formatStaffDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
}

function formatShortDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : shortDateFormat.format(date)
}

/** "All stores", one Store name, or the first name and how many more. */
export function staffStoresText(member: StaffMemberRow) {
  const access = member.access
  if (!access) return "—"
  if (access.allStores) return "All stores"
  const [first, ...rest] = access.stores
  if (!first) return "No stores"
  return rest.length ? `${first.storeName} +${rest.length}` : first.storeName
}

/** The line under a status: when an invite expires or expired. */
export function staffStatusDetail(member: StaffMemberRow) {
  const key = getStaffStatusKey(member)
  const expiresAt = member.access?.invitationExpiresAt
  if (key === "invited" && expiresAt)
    return `Expires ${formatShortDate(expiresAt)}`
  if (key === "expired" && expiresAt)
    return `Expired ${formatShortDate(expiresAt)}`
  return null
}

const STATUS_TONE = {
  active: "text-success-foreground",
  expired: "text-warning-foreground",
  invited: "text-foreground",
  suspended: "text-destructive",
} as const

const STATUS_DOT = {
  active: "bg-success-foreground",
  expired: "bg-warning-foreground",
  invited: "bg-muted-foreground",
  suspended: "bg-destructive",
} as const

export function StaffStatus({
  member,
  showDetail = true,
}: {
  member: StaffMemberRow
  showDetail?: boolean
}) {
  const key = getStaffStatusKey(member)
  const detail = showDetail ? staffStatusDetail(member) : null
  return (
    <div className="grid gap-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap",
          STATUS_TONE[key],
        )}
      >
        <span
          className={cn("size-1.5 rounded-full", STATUS_DOT[key])}
          aria-hidden="true"
        />
        {staffStatusKeyLabels[key]}
      </span>
      {detail ? (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {detail}
        </span>
      ) : null}
    </div>
  )
}

export function StaffRoleBadge({ role }: { role: string }) {
  const lead = ["OWNER", "ADMIN"].includes(role.trim().toUpperCase())
  return (
    <Badge variant={lead ? "outline" : "secondary"}>
      {getStaffRoleLabel(role)}
    </Badge>
  )
}

export function StaffJoined({ member }: { member: StaffMemberRow }) {
  return (
    <span className="whitespace-nowrap text-muted-foreground">
      {formatStaffDate(member.acceptedAt)}
    </span>
  )
}

export function StaffAvatar({
  member,
  className,
}: {
  member: StaffMemberRow
  className?: string
}) {
  const initials = getStaffDisplayName(member)
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <Avatar className={cn("size-8", className)} aria-hidden="true">
      <AvatarFallback className="text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

export function StaffName({
  member,
  onOpen,
}: {
  member: StaffMemberRow
  onOpen?: (member: StaffMemberRow) => void
}) {
  const name = getStaffDisplayName(member)
  if (!onOpen) return <span className="truncate font-medium">{name}</span>
  return (
    <button
      type="button"
      className="truncate text-left font-medium underline-offset-4 hover:underline focus-visible:underline"
      onClick={() => onOpen(member)}
    >
      {name}
    </button>
  )
}
