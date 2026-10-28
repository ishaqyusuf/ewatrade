import { expect, test } from "bun:test"
import { fixture } from "../../../../packages/storefront-templates/src/fixtures"
import { storefrontPresentation } from "./storefront-presentation"

test("shell identity changes with publication, business and session but not page listing data", () => {
  const snapshot = fixture("populated")
  const first = storefrontPresentation(snapshot)
  const page = structuredClone(snapshot)
  page.resources.catalog.items = []
  page.resources.catalog.highlightedItem =
    snapshot.resources.catalog.items[0] ?? null
  expect(storefrontPresentation(page).revision).toBe(first.revision)
  page.resources.business.name = "Changed public name"
  expect(storefrontPresentation(page).revision).not.toBe(first.revision)
  expect(
    storefrontPresentation(snapshot, {
      signedIn: true,
      label: "m***@test.test",
      channel: "email",
    }).revision,
  ).not.toBe(first.revision)
  expect(storefrontPresentation(snapshot, null, "services").revision).toBe(
    first.revision,
  )
  expect(first.revision).toMatch(/^[a-f0-9]{64}$/)
})
