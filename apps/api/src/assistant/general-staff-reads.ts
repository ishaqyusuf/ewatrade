import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type {
  getStaffDirectoryMember,
  listStaffDirectoryPage,
} from "@ewatrade/db/queries"
import {
  retailOpsStaffDirectoryPageSchema,
  retailOpsStaffDirectoryMemberSchema,
} from "../schemas/retail-ops-staff-reads"

export const generalStaffDirectoryInput = retailOpsStaffDirectoryPageSchema
  .omit({ limit: true })
  .strict()
export const generalStaffMemberInput = retailOpsStaffDirectoryMemberSchema

function preview(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

export function generalStaffDirectoryAnswer(
  page: Awaited<ReturnType<typeof listStaffDirectoryPage>>,
): GeneralAnswer {
  return {
    id: `staff_directory_${crypto.randomUUID()}`,
    title: "Staff directory",
    value: `${page.total} matching memberships`,
    scope:
      page.scope === "active_store_assignments"
        ? "Business · explicit active Store assignments"
        : "Business · membership directory",
    asOf: page.asOf,
    detail: `${page.data.length ? `Name/email preview: ${preview(page.data.map((member) => `${preview(member.name, 80)} (${preview(member.email, 80)}) · ${member.role} · ${member.status}`).join("; "), 400)}. Full identities are in the directory results.` : "No memberships match."} ${page.data.length} on this page. ${page.nextCursor ? "More results; continue with the original filters and cursor." : "End of this list."} Total is exact for this request, including only matching statuses. ${page.coverage.profile === "partial" ? "Some durable profiles are unavailable; membership identity is shown." : "Durable profiles available for this page."} History has not been read. Store filters require saved active assignments; legacy Store access is not inferred.`,
  }
}

export function generalStaffMemberAnswer(
  member: Awaited<ReturnType<typeof getStaffDirectoryMember>>,
): GeneralAnswer {
  return {
    id: `staff_member_${crypto.randomUUID()}`,
    title: preview(`Staff · ${member.name}`, 160),
    value: `${member.role} · ${member.status}`,
    scope: "Business · exact membership",
    asOf: new Date().toISOString(),
    detail: `Email: ${preview(member.email, 320)}. Invited ${member.invitedAt?.toISOString() ?? "date unavailable"}; accepted ${member.acceptedAt?.toISOString() ?? "date unavailable"}. ${member.profileCoverage === "unavailable" ? "Durable profile unavailable; membership identity is shown." : "Durable profile available."} These are current membership facts; lifecycle, actor and Store access history have not been read.`,
    target: { kind: "staff_member", membershipId: member.membershipId },
  }
}
