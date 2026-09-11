import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"

export type StaffDraft = { email: string; name: string }
export type StaffMember = RouterOutputs["retailOps"]["staff"][number]
export type StaffRow = {
  detail: string
  email: string
  id: string
  initials: string
  name: string
  statusLabel: string
}
export const STAFF_SEARCH_LIMIT = 120
export const STAFF_RESULT_LIMIT = 100
export const emptyStaffDraft = (): StaffDraft => ({ email: "", name: "" })

function formatStaffDate(value: Date | string | null | undefined) {
  if (!value) return "Not set"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "Not set"
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

export function staffStatusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return "Active"
    case "pending":
    case "invited":
      return "Pending"
    case "suspended":
      return "Suspended"
    default:
      return status
  }
}

export function mapStaffMember(staff: StaffMember): StaffRow {
  const name =
    staff.user.displayName?.trim() ||
    staff.user.name?.trim() ||
    staff.user.email
  const roles: Record<string, string> = {
    cashier: "Attendant",
    operator: "Operator",
    manager: "Manager",
    owner: "Owner",
    admin: "Admin",
  }
  return {
    id: staff.id,
    name,
    initials: name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? "")
      .join("")
      .toUpperCase(),
    email: staff.user.email,
    statusLabel: staffStatusLabel(staff.status),
    detail: `${roles[staff.role.toLowerCase()] ?? staff.role} · invited ${formatStaffDate(staff.invitedAt ?? staff.createdAt)}`,
  }
}

export function prepareStaffInvite(
  draft: StaffDraft,
  storeId: string,
  externalId: string,
): { input: RouterInputs["retailOps"]["inviteStaff"] } | { error: string } {
  const email = draft.email.trim().toLowerCase()
  const name = draft.name.trim()
  if (
    !email ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { error: "Enter a valid email address within 320 characters." }
  }
  if (name.length > 120)
    return { error: "Keep the attendant name within 120 characters." }
  return {
    input: {
      email,
      name: name || undefined,
      role: "cashier",
      storeId,
      externalId,
    },
  }
}
