import { expect, test } from "bun:test"
import { getDashboardRouteUrl } from "@ewatrade/onboarding/lib/signup-navigation"
import { renderToStaticMarkup } from "react-dom/server"
import { PricingV15 } from "../components/marketing/experiences/launch-v4/pricing-v15"
import { getMarketingPlanCta } from "./marketing-offers"

test("paid pricing controls open dashboard billing instead of contacting sales", async () => {
  const controls: Array<{ href: string | null; plan: string | null }> = []
  await new HTMLRewriter()
    .on("a[data-marketing-channel=pricing]", {
      element(element) {
        controls.push({
          href: element.getAttribute("href"),
          plan: element.getAttribute("data-marketing-category"),
        })
      },
    })
    .transform(new Response(renderToStaticMarkup(<PricingV15 signupEnabled />)))
    .text()
  for (const plan of ["starter", "growth", "pro"] as const) {
    expect(controls.find((control) => control.plan === plan)?.href).toBe(
      getDashboardRouteUrl("/settings/billing"),
    )
    expect(getMarketingPlanCta(plan, true).label).toBe(
      `Choose ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
    )
  }
})

test("paid plans remain account-gated when public signup is closed", () => {
  expect(getMarketingPlanCta("growth", false).href).toBe(
    getDashboardRouteUrl("/settings/billing"),
  )
  expect(getMarketingPlanCta("free", false).href).toBe("/contact")
})
