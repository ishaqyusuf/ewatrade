import { describe, expect, test } from "bun:test"
import { renderLifecycleEmail } from "../components/lifecycle-layout"
import { lifecycleRevenuePreviews } from "../src/lifecycle-revenue-fixtures"
import { LIFECYCLE_SUBJECT_MAX } from "./lifecycle-adoption"
import {
  LIFECYCLE_REVENUE_TEMPLATES,
  featureIntentEmail,
  limitReachedEmail,
  limitWarningEmail,
  secondBusinessEmail,
  successMilestoneEmail,
  whatsappExhaustedEmail,
  whatsappWarningEmail,
} from "./lifecycle-revenue"

const entries = Object.entries(LIFECYCLE_REVENUE_TEMPLATES) as [
  keyof typeof LIFECYCLE_REVENUE_TEMPLATES,
  (typeof LIFECYCLE_REVENUE_TEMPLATES)[keyof typeof LIFECYCLE_REVENUE_TEMPLATES],
][]
const previews = lifecycleRevenuePreviews

describe("lifecycle revenue emails", () => {
  test("every template follows the plan §6 rules on its preview fixture", () => {
    expect(entries).toHaveLength(7)
    for (const [key, template] of entries) {
      const { subject, content } = template(previews[key])
      expect(subject.length).toBeLessThanOrEqual(LIFECYCLE_SUBJECT_MAX)
      expect(content.lead).toMatch(/\d/)
      expect((content.body ?? []).length).toBeLessThanOrEqual(3)
      const { html, text } = renderLifecycleEmail(content)
      expect(html.split(content.cta.href)).toHaveLength(2)
      expect(text).toContain(content.lead)
      for (const line of [
        subject,
        content.preview,
        content.lead,
        ...(content.body ?? []),
      ])
        expect(line).not.toMatch(/[—!]/)
    }
  })

  test("90% orders warning names the reset and the smallest plan", () => {
    const { subject, content } = limitWarningEmail(
      previews["lifecycle-limit-warning"],
    )
    expect(subject).toBe("45 of 50 orders used this month")
    expect(content.lead).toBe(
      "Amina Home & Trade has recorded 45 of the 50 orders Free includes this month.",
    )
    expect(content.body?.[1]).toBe(
      "Starter includes unlimited orders a month for ₦5,000/month. You can upgrade from Plan and billing and pay by card.",
    )
    expect(content.cta.label).toBe("Upgrade to Starter")
  })

  test("without checkout the copy never promises card payment", () => {
    const input = previews["lifecycle-limit-warning"]
    const { content } = limitWarningEmail({
      ...input,
      data: { ...input.data, checkoutAvailable: false, ctaLabel: "See plans" },
    })
    expect(content.body?.join(" ")).not.toContain("pay by card")
    expect(content.cta.label).toBe("See plans")
  })

  test("100% shows the comparison and what stops", () => {
    const { subject, content } = limitReachedEmail(
      previews["lifecycle-limit-reached"],
    )
    expect(subject).toBe("You've reached 10 products on Free")
    expect(content.stat).toEqual({
      label: "Free → Starter",
      value: "10 → 100 products",
    })
    expect(content.body?.[0]).toContain("until you archive one")
  })

  test("success leads with their sales, then one line on the next plan", () => {
    const { subject, content } = successMilestoneEmail(
      previews["lifecycle-success-milestone"],
    )
    expect(subject).toBe("₦450,000 in sales so far this month")
    expect(content.lead).toContain("₦450,000")
    expect(content.body?.[1]).toStartWith("Growth adds")
    const orders = successMilestoneEmail({
      ...previews["lifecycle-success-milestone"],
      data: {
        ...previews["lifecycle-success-milestone"].data,
        milestone: "orders_100",
        ordersTotal: 103,
      },
    })
    expect(orders.subject).toBe("100 orders on EwaTrade")
    expect(orders.content.lead).toContain("103")
  })

  test("second business on Growth needs no upgrade line", () => {
    const input = previews["lifecycle-second-business"]
    const { content } = secondBusinessEmail({
      ...input,
      data: {
        ordersLast7: 130,
        planName: "Growth",
        needsUpgrade: false,
        businessesIncluded: 3,
        ctaLabel: "Add a business",
      },
    })
    expect(content.body?.[1]).toBe(
      "Growth already includes 3 businesses, so you can add one now.",
    )
  })

  test("feature intent counts the taps and promises one email", () => {
    const { subject, content } = featureIntentEmail(
      previews["lifecycle-feature-intent"],
    )
    expect(subject).toBe("You looked at photos, videos and documents")
    expect(content.lead).toContain("3 times")
    expect(content.body?.[1]).toContain("won't email you about it again")
  })

  test("Free WhatsApp warning offers Starter first, then Telegram", () => {
    const { subject, content } = whatsappWarningEmail(
      previews["lifecycle-whatsapp-warning"],
    )
    expect(subject).toBe("40 WhatsApp replies left this month")
    expect(content.body?.[1]).toContain("Starter gives you 1,000 replies")
    expect(content.body?.[1]).toContain("5 times")
    expect(content.body?.[2]).toContain("don't count toward the WhatsApp limit")
  })

  test("paid exhausted without a top-up offers only Telegram", () => {
    const { subject, content } = whatsappExhaustedEmail(
      previews["lifecycle-whatsapp-exhausted"],
    )
    expect(subject).toBe("You've used all 1,000 WhatsApp replies")
    expect(content.body).toHaveLength(2)
    expect(content.body?.join(" ")).not.toContain("Starter")
    expect(content.body?.join(" ")).not.toContain("top-up")
    expect(content.cta.label).toBe("Connect Telegram")
  })
})
