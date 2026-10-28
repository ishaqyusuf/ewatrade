import { BrandEmail, EmailDetails } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type StorefrontTemplateUpdateEmailInput = {
  businessName: string
  version: string
  title: string
  changes: readonly string[]
  upgradeUrl: string
}

export function renderStorefrontTemplateUpdateTemplate(
  input: StorefrontTemplateUpdateEmailInput,
) {
  const cta = { href: input.upgradeUrl, label: "Upgrade template" }
  const intro = `A new version of the template used by ${input.businessName} is ready. Here’s what’s new:`
  const note =
    "Your live website stays the same until you review and publish. Your business details and copy stay yours. You can manage these email notices on the review page."
  const details = input.changes.map((value, index) => ({
    label: index === 0 ? "What’s new" : "Also new",
    value,
  }))
  return {
    html: renderEmailMarkup(
      <BrandEmail
        cta={cta}
        eyebrow={`Storefront update · ${input.version}`}
        intro={intro}
        note={note}
        preview={input.title}
        title={input.title}
      >
        <EmailDetails details={details} />
      </BrandEmail>,
    ),
    text: createEmailText({ cta, details, intro, note, title: input.title }),
  }
}
