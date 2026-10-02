import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { StepSuccess } from "./step-success"

test("completion keeps future storefront/POS pending and the shared dashboard usable", () => {
  const markup = renderToStaticMarkup(
    <StepSuccess
      tenantSlug="hello-qa"
      businessName="Hello"
      storefrontUrl="https://hello-qa-storefront.localhost"
      posUrl="https://hello-qa-pos.localhost"
      dashboardUrl="https://ewatrade.com/dashboard"
    />,
  )
  expect(markup).not.toContain('href="https://hello-qa-storefront.localhost"')
  expect(markup).not.toContain('href="https://hello-qa-pos.localhost"')
  expect(markup).toContain('aria-disabled="true"')
  expect(markup).toContain("Coming later")
  expect(markup).toContain('href="https://ewatrade.com/dashboard"')
  expect(markup).toContain("ewatrade.com/dashboard")
  expect(markup).toContain("Shared dashboard")
  expect(markup).toContain("We sent a confirmation email")
})

test("completion states delivery failure without claiming that an email was sent", () => {
  const markup = renderToStaticMarkup(
    <StepSuccess
      tenantSlug="hello-qa"
      businessName="Hello"
      emailDeliveryStatus="failed"
    />,
  )
  expect(markup).toContain("confirmation email could not be sent yet")
  expect(markup).not.toContain("We sent a confirmation email")
})
