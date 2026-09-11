import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type RetailOpsStaffInviteEmailInput = {
  appUrl: string
  businessName: string
  inviteUrl?: string
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

function getContent(input: RetailOpsStaffInviteEmailInput) {
  const inviteeName = input.inviteeName?.trim() || input.inviteeEmail
  const roleLabel = getRoleLabel(input.role)

  return {
    cta: {
      href: input.inviteUrl ?? input.appUrl,
      label: "Review your invitation",
    },
    details: [
      { label: "Business", value: input.businessName },
      { label: "Invited person", value: inviteeName },
      { label: "Email", value: input.inviteeEmail },
      { label: "Role", value: roleLabel },
      { label: "Invited by", value: input.invitedByName },
    ],
    intro: `${input.invitedByName} invited you to join ${input.businessName} as ${roleLabel}. Review the secure invitation before joining the workspace.`,
    note: "If you were not expecting this invitation, do not open the link. You can safely ignore this email.",
  }
}

export function RetailOpsStaffInviteEmail({
  input,
}: {
  input: RetailOpsStaffInviteEmailInput
}) {
  const content = getContent(input)

  return (
    <BrandEmail
      cta={content.cta}
      eyebrow="Workspace invitation"
      intro={content.intro}
      note={content.note}
      preview={`${input.invitedByName} invited you to ${input.businessName}`}
      title="There is a place for you on the team."
    >
      <EmailStatus label="Invitation open" tone="live" />
      <EmailDetails details={content.details} />
    </BrandEmail>
  )
}

export function renderRetailOpsStaffInviteTemplate(
  input: RetailOpsStaffInviteEmailInput,
) {
  const content = getContent(input)

  return {
    html: renderEmailMarkup(<RetailOpsStaffInviteEmail input={input} />),
    text: createEmailText({
      cta: content.cta,
      details: content.details,
      intro: content.intro,
      note: content.note,
      title: "There is a place for you on the team.",
    }),
  }
}

export default RetailOpsStaffInviteEmail
