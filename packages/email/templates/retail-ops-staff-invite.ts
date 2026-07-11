import { renderMarketingEmailTemplate } from "./shared"

export type RetailOpsStaffInviteEmailInput = {
  appUrl: string
  businessName: string
  invitedByName: string
  inviteeEmail: string
  inviteeName?: string | null
  role: string
}

function getRoleLabel(role: string) {
  return role
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function renderRetailOpsStaffInviteTemplate(
  input: RetailOpsStaffInviteEmailInput,
) {
  const inviteeName = input.inviteeName?.trim() || input.inviteeEmail
  const roleLabel = getRoleLabel(input.role)

  return renderMarketingEmailTemplate({
    ctaHref: input.appUrl,
    ctaLabel: "Get started",
    intro: `${input.invitedByName} invited you to join ${input.businessName} as ${roleLabel}. Download or open the ewatrade app to accept the invitation and start working with the business.`,
    outro:
      "If you were not expecting this invitation, you can ignore this email.",
    sections: [
      { label: "Business", value: input.businessName },
      { label: "Invited person", value: inviteeName },
      { label: "Email", value: input.inviteeEmail },
      { label: "Role", value: roleLabel },
      { label: "Invited by", value: input.invitedByName },
    ],
    title: "You have been added to ewatrade",
  })
}
