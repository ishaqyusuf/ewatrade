import { describe, expect, test } from "bun:test"
import { renderLifecycleEmail } from "../components/lifecycle-layout"
import { lifecycleAdoptionPreviews } from "../src/lifecycle-adoption-fixtures"
import {
  LIFECYCLE_ADOPTION_TEMPLATES,
  LIFECYCLE_SUBJECT_MAX,
  atRiskEmail,
  moneyAccountsEmail,
  monthlyReportEmail,
  siteSetupEmail,
  winBackEmail,
} from "./lifecycle-adoption"

const entries = Object.entries(LIFECYCLE_ADOPTION_TEMPLATES) as [
  keyof typeof LIFECYCLE_ADOPTION_TEMPLATES,
  (typeof LIFECYCLE_ADOPTION_TEMPLATES)[keyof typeof LIFECYCLE_ADOPTION_TEMPLATES],
][]

describe("lifecycle adoption emails", () => {
  test("every template follows the plan §6 rules on its preview fixture", () => {
    expect(entries).toHaveLength(9)
    for (const [key, template] of entries) {
      const { subject, content } = template(lifecycleAdoptionPreviews[key])
      expect(subject.length).toBeLessThanOrEqual(LIFECYCLE_SUBJECT_MAX)
      // Their own number in the first line.
      expect(content.lead).toMatch(/\d/)
      expect(content.cta.href).toBe("https://app.ewatrade.com/go/preview-token")
      expect(content.businessName).toBe("Amina Home & Trade")
      const { html, text } = renderLifecycleEmail(content)
      // One button: the CTA link appears once in the HTML.
      expect(html.split(content.cta.href)).toHaveLength(2)
      expect(text).toContain(content.lead)
      expect(text).toContain(`${content.cta.label}: ${content.cta.href}`)
    }
  })

  test("copy avoids em dashes and exclamation marks", () => {
    for (const [key, template] of entries) {
      const { subject, content } = template(lifecycleAdoptionPreviews[key])
      const copy = [
        subject,
        content.preview,
        content.lead,
        ...(content.body ?? []),
      ]
      for (const line of copy) expect(line).not.toMatch(/[—!]/)
    }
  })

  test("site setup counts products in the subject and pluralises", () => {
    const input = lifecycleAdoptionPreviews["lifecycle-site-setup"]
    expect(siteSetupEmail(input).subject).toBe("Put your 12 products online")
    expect(
      siteSetupEmail({ ...input, data: { catalogItems: 1 } }).subject,
    ).toBe("Put your 1 product online")
  })

  test("monthly report leads with last month's sales in naira", () => {
    const { subject, content } = monthlyReportEmail(
      lifecycleAdoptionPreviews["lifecycle-monthly-report"],
    )
    expect(subject).toBe("Your October on EwaTrade")
    expect(content.lead).toBe(
      "In October, Amina Home & Trade recorded 48 sales worth ₦213,500.",
    )
    expect(content.stat?.value).toBe("₦213,500")
  })

  test("money accounts lead covers no account and one account", () => {
    const input = lifecycleAdoptionPreviews["lifecycle-money-accounts"]
    expect(moneyAccountsEmail(input).content.lead).toContain("one account")
    expect(
      moneyAccountsEmail({
        ...input,
        data: { ordersTotal: 12, moneyAccounts: 0 },
      }).content.lead,
    ).toContain("none of that money")
  })

  test("at-risk subject falls back when the business name is long", () => {
    const input = lifecycleAdoptionPreviews["lifecycle-at-risk"]
    expect(atRiskEmail(input).subject).toBe(
      "12 quiet days at Amina Home & Trade",
    )
    expect(
      atRiskEmail({
        ...input,
        businessName: "Northbank Essentials and Provisions Ltd",
      }).subject,
    ).toBe("12 quiet days on EwaTrade")
  })

  test("win-back handles a business that never sold", () => {
    const input = lifecycleAdoptionPreviews["lifecycle-win-back"]
    expect(
      winBackEmail({ ...input, data: { inactiveDays: 40, ordersTotal: 0 } })
        .content.lead,
    ).toBe("It's been 40 days since Amina Home & Trade was set up on EwaTrade.")
  })
})
