import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type WorkspaceWelcomeEmailInput = {
  businessName: string
  dashboardHostname: string
  dashboardUrl: string
  firstName: string
  posHostname: string
  storefrontHostname: string
}

function getContent(input: WorkspaceWelcomeEmailInput) {
  return {
    cta: { href: input.dashboardUrl, label: "Open your dashboard" },
    intro: `${input.businessName} is ready on EwaTrade, ${input.firstName}. Your workspace, Storefront, and POS addresses have been reserved.`,
    note: "Start with the dashboard. Add the items or services you sell, confirm your Store details, then share the Storefront when you are ready.",
  }
}

export function WorkspaceWelcomeEmail({
  input,
}: {
  input: WorkspaceWelcomeEmailInput
}) {
  const content = getContent(input)

  return (
    <BrandEmail
      cta={content.cta}
      eyebrow="Workspace ready"
      intro={content.intro}
      note={content.note}
      preview={`${input.businessName} is ready on EwaTrade`}
      title="Your business has a new operating desk."
    >
      <EmailStatus label="Workspace live" tone="live" />
      <EmailDetails
        details={[
          { label: "Storefront", value: input.storefrontHostname },
          { label: "POS", value: input.posHostname },
          { label: "Dashboard", value: input.dashboardHostname },
        ]}
      />
    </BrandEmail>
  )
}

export function renderWorkspaceWelcomeTemplate(
  input: WorkspaceWelcomeEmailInput,
) {
  const content = getContent(input)

  return {
    html: renderEmailMarkup(<WorkspaceWelcomeEmail input={input} />),
    text: createEmailText({
      cta: content.cta,
      details: [
        { label: "Storefront", value: input.storefrontHostname },
        { label: "POS", value: input.posHostname },
        { label: "Dashboard", value: input.dashboardHostname },
      ],
      intro: content.intro,
      note: content.note,
      title: "Your business has a new operating desk.",
    }),
  }
}

export default WorkspaceWelcomeEmail
