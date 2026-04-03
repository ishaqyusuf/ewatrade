import { renderMarketingEmailTemplate } from "./shared"

export type MarketingLeadEmailInput = {
  companyName?: string | null
  email: string
  fullName: string
  id: string
  message?: string | null
  phone?: string | null
  roleTitle?: string | null
}

export function renderMarketingEarlyAccessAdminTemplate(input: MarketingLeadEmailInput) {
  return renderMarketingEmailTemplate({
    intro: "A merchant or operator requested early access from the ewatrade marketing site.",
    sections: [
      { label: "Lead ID", value: input.id },
      { label: "Name", value: input.fullName },
      { label: "Email", value: input.email },
      { label: "Company", value: input.companyName },
      { label: "Role", value: input.roleTitle },
      { label: "Phone", value: input.phone },
      { label: "Message", value: input.message }
    ],
    title: "New early access request"
  })
}
