import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import { getCountry, toInternationalPhone } from "@ewatrade/utils/countries"
import { parsePhoneNumberFromString } from "libphonenumber-js"

const formatInternationalPhone = (phone: string) =>
  parsePhoneNumberFromString(phone)?.formatInternational() ?? phone

/** How the invite reaches the attendant, as in registration's Connect with. */
export type StaffInviteChannel = "email" | "whatsapp" | "both"
export type StaffDraft = {
  channel: StaffInviteChannel
  email: string
  name: string
  /** National digits typed beside the country's +code. */
  phone: string
  phoneCountry: string
}
export type StaffInviteDelivery = "sent" | "pending" | "failed" | null
export type StaffMember = RouterOutputs["retailOps"]["staff"][number]
export type StaffRow = {
  detail: string
  /** Contact lines: the email and/or the WhatsApp number. */
  email: string
  phone: string
  /** The invite's numbers as saved (+E.164), for duplicate checks and resend. */
  phoneE164: string
  inviteEmail: string
  /** WhatsApp state of a pending invite sent by WhatsApp. */
  whatsapp: StaffInviteDelivery
  id: string
  initials: string
  name: string
  statusLabel: string
}
export const STAFF_SEARCH_LIMIT = 120
export const STAFF_RESULT_LIMIT = 100
export const emptyStaffDraft = (): StaffDraft => ({
  channel: "email",
  email: "",
  name: "",
  phone: "",
  phoneCountry: "NG",
})

export function staffDraftShows(draft: StaffDraft) {
  return {
    email: draft.channel !== "whatsapp",
    phone: draft.channel !== "email",
  }
}

function whatsappDelivery(
  status: string | null | undefined,
): StaffInviteDelivery {
  if (status === "SENT" || status === "LOCAL_ONLY") return "sent"
  if (status === "UNCONFIRMED") return "pending"
  if (status === "FAILED" || status === "NOT_CONFIGURED") return "failed"
  return null
}

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
  const phone = staff.invitation?.phone ?? staff.user.phone ?? ""
  const name =
    staff.user.displayName?.trim() ||
    staff.user.name?.trim() ||
    staff.user.email ||
    formatInternationalPhone(phone)
  const roles: Record<string, string> = {
    cashier: "Cashier",
    operator: "Sales rep",
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
    phone: phone ? formatInternationalPhone(phone) : "",
    phoneE164: phone,
    inviteEmail: staff.invitation?.email ?? staff.user.email,
    whatsapp: staff.invitation?.phone
      ? whatsappDelivery(staff.invitation.whatsapp)
      : null,
    statusLabel: staffStatusLabel(staff.status),
    detail: `${roles[staff.role.toLowerCase()] ?? staff.role} · ${["pending", "invited"].includes(staff.status.toLowerCase()) ? `invited ${formatStaffDate(staff.invitedAt ?? staff.createdAt)}` : `member since ${formatStaffDate(staff.createdAt)}`}`,
  }
}

export type StaffDraftErrors = { email?: string; phone?: string }

function draftContacts(draft: StaffDraft) {
  const shows = staffDraftShows(draft)
  return {
    shows,
    email: shows.email ? draft.email.trim().toLowerCase() : "",
    phone:
      shows.phone && draft.phone.trim()
        ? toInternationalPhone(
            getCountry(draft.phoneCountry).dialCode,
            draft.phone,
          )
        : "",
  }
}

/** Each chosen contact is required; Workshop staff-invite-channels 01 copy. */
export function staffDraftErrors(draft: StaffDraft): StaffDraftErrors {
  const { shows, email, phone } = draftContacts(draft)
  const errors: StaffDraftErrors = {}
  if (shows.email) {
    if (!email) errors.email = "Add their email address"
    else if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = "Enter a full email address, like name@example.com"
  }
  if (shows.phone) {
    if (!phone) errors.phone = "Add their WhatsApp number"
    else if (!/^\+[1-9]\d{7,14}$/.test(phone))
      errors.phone =
        draft.phoneCountry === "NG"
          ? "Enter a full WhatsApp number, like 802 123 4567"
          : "Enter a full WhatsApp number"
  }
  return errors
}

/** The loaded staff member this draft would invite again, if any. */
export function findStaffDuplicate(draft: StaffDraft, rows: StaffRow[]) {
  const { email, phone } = draftContacts(draft)
  const errors = staffDraftErrors(draft)
  for (const row of rows) {
    if (phone && !errors.phone && row.phoneE164 === phone)
      return { row, via: "phone" as const }
    if (email && !errors.email && row.inviteEmail.toLowerCase() === email)
      return { row, via: "email" as const }
  }
  return null
}

export function prepareStaffInvite(
  draft: StaffDraft,
  storeId: string,
  externalId: string,
): { input: RouterInputs["retailOps"]["inviteStaff"] } | { error: string } {
  const { email, phone } = draftContacts(draft)
  const name = draft.name.trim()
  const errors = staffDraftErrors(draft)
  const error = errors.email ?? errors.phone
  if (error) return { error }
  if (name.length > 120)
    return { error: "Keep the attendant name within 120 characters." }
  return {
    input: {
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      name: name || undefined,
      role: "cashier",
      storeId,
      externalId,
    },
  }
}
