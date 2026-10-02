import { expect, test } from "bun:test"
import { buildInternalTenantHostname } from "./domain"
import { withQaWorkspaceSuffix } from "./qa-workspace-slug"

test("QA hostnames share the suffixed workspace identity on local and production surfaces", () => {
  const slug = withQaWorkspaceSuffix("Hello", true)
  expect(slug).toBe("hello-qa")
  for (const [surface, local, production] of [
    ["storefront", "hello-qa-storefront.localhost", "hello-qa.ewatrade.com"],
    ["pos", "hello-qa-pos.localhost", "hello-qa-pos.ewatrade.com"],
  ] as const) {
    for (const [platformDomain, expected] of [
      ["localhost", local],
      ["ewatrade.com", production],
    ] as const) {
      expect(
        buildInternalTenantHostname({
          tenantSlug: slug,
          localProjectSlug: slug,
          surface,
          platformDomain,
        }),
      ).toBe(expected)
    }
  }
})

test("QA slug construction is idempotent and ordinary names remain unchanged", () => {
  expect(withQaWorkspaceSuffix("hello-qa", true)).toBe("hello-qa")
  expect(withQaWorkspaceSuffix("hello", false)).toBe("hello")
  expect(withQaWorkspaceSuffix("", true)).toBe("")
  expect(withQaWorkspaceSuffix("a".repeat(48), true, 48)).toBe(
    `${"a".repeat(45)}-qa`,
  )
})
