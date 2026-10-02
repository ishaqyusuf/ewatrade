import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { StepLegal } from "./step-legal"

const publication = {
  acceptanceRequired: true,
  approved: true,
  signupAvailable: true,
  version: "2026-10-01-approved-1",
  effectiveDate: "2026-10-01",
}

test("final onboarding presents both documents before one unchecked agreement and disabled submit", () => {
  const markup = renderToStaticMarkup(
    <StepLegal
      publication={publication}
      isSubmitting={false}
      submitError=""
      onBack={() => {}}
      onNext={() => {}}
    />,
  )
  expect(markup).toContain("Step 3 of 3")
  expect(markup).toContain("Read Terms of Service")
  expect(markup).toContain("Read Privacy Notice")
  expect(markup).toContain("ZEROES AND ONE TECH HUB NIG LIMITED")
  expect(markup.match(/type="checkbox"/g)).toHaveLength(1)
  expect(markup).not.toContain("checked=")
  expect(markup).toContain('type="submit" class="signup-primary" disabled=""')
  expect(markup.indexOf('type="checkbox"')).toBeGreaterThan(
    markup.indexOf('href="/privacy"'),
  )
})
