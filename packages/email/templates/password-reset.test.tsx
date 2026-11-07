import { expect, test } from "bun:test"
import { renderPasswordResetTemplate } from "./password-reset"

test("recovery email preserves its private fragment link and shared design", () => {
  const resetUrl =
    "https://dash.ewatrade.com/reset-password#token=inert-test-token"
  const rendered = renderPasswordResetTemplate({ resetUrl })
  expect(rendered.html).toContain('data-email-system="warm-desk"')
  expect(rendered.html).toContain(`href="${resetUrl}"`)
  expect(rendered.text).toContain(resetUrl)
  expect(rendered.text).toContain("15 minutes")
  expect(rendered.text).toContain("used once")
  expect(rendered.text).toContain("ignore this email")
})
