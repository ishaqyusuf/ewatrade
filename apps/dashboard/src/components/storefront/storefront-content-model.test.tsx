import { expect, test } from "bun:test"
import {
  canvasManifest,
  defaultComposition,
  storefrontContentFields,
} from "@ewatrade/storefront-templates"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  type ContentReviewRow,
  contentFieldHasEdits,
  mergeContentReview,
  selectedContentRefinements,
} from "./storefront-content-model"
import { StorefrontContentReviewRow } from "./storefront-content-review"

function fixture() {
  const composition = defaultComposition(canvasManifest("catalog-v4"))
  const fields = storefrontContentFields(composition, "home").slice(0, 2)
  if (fields.length !== 2) throw new Error("Expected two content fields.")
  const rows: ContentReviewRow[] = fields.map((field) => ({
    field,
    text: "Initial example",
    selected: true,
    edited: false,
  }))
  return { fields, rows }
}
test("existing copy is excluded by default while defaults and empty fields are eligible", () => {
  const { fields } = fixture()
  const field = fields[0]
  if (!field) throw new Error("Expected a field.")
  expect(
    contentFieldHasEdits({ ...field, current: "", defaultValue: "" }),
  ).toBe(false)
  expect(
    contentFieldHasEdits({
      ...field,
      current: "Default",
      defaultValue: "Default",
    }),
  ).toBe(false)
  expect(
    contentFieldHasEdits({
      ...field,
      current: "My own wording",
      defaultValue: "Default",
    }),
  ).toBe(true)
})
test("typed refinement selects only checked fields and preserves hand edits by default", () => {
  const { rows } = fixture()
  const first = rows[0]
  const second = rows[1]
  if (!first || !second) throw new Error("Expected review rows.")
  const edited = { ...first, text: "My precise wording", edited: true }
  expect(selectedContentRefinements([edited, second], true)).toEqual([
    { id: second.field.id, text: second.text },
  ])
  expect(selectedContentRefinements([edited, second], false)).toHaveLength(2)
  expect(
    selectedContentRefinements([edited, { ...second, selected: false }], true),
  ).toHaveLength(0)
  const merged = mergeContentReview(
    [edited, second],
    [second.field],
    {
      version: 1,
      fields: [
        { id: second.field.id, text: "Shorter text", sourceReferences: [] },
      ],
    },
    true,
  )
  expect(merged[0]).toEqual(edited)
  expect(merged[1]).toMatchObject({
    text: "Shorter text",
    edited: false,
    selected: true,
  })
})
test("fresh generation replaces prior review rows and refuses unknown output areas", () => {
  const { fields, rows } = fixture()
  const first = fields[0]
  if (!first) throw new Error("Expected a field.")
  expect(
    mergeContentReview(
      rows,
      fields,
      {
        version: 1,
        fields: [{ id: first.id, text: "New draft", sourceReferences: [] }],
      },
      false,
    ),
  ).toHaveLength(1)
  expect(() =>
    mergeContentReview(
      rows,
      fields,
      {
        version: 1,
        fields: [{ id: "foreign", text: "No", sourceReferences: [] }],
      },
      true,
    ),
  ).toThrow("unavailable area")
})
test("review row exposes editable copy, current text, range and accessible hard-limit feedback", () => {
  const { rows } = fixture()
  const first = rows[0]
  if (!first) throw new Error("Expected a row.")
  const html = renderToStaticMarkup(
    createElement(StorefrontContentReviewRow, {
      row: { ...first, text: "Long wording ".repeat(30), edited: true },
      onChange: () => {},
    }),
  )
  expect(html).toContain("Edited by you")
  expect(html).toContain("Current")
  expect(html).toContain('aria-invalid="true"')
  expect(html).toContain("Enter plain text within")
  expect(html).toContain("words · aim for")
  expect(html).toContain("aria-describedby=")
  const escaped = renderToStaticMarkup(
    createElement(StorefrontContentReviewRow, {
      row: { ...first, text: "<script>example</script>" },
      onChange: () => {},
    }),
  )
  expect(escaped).toContain("&lt;script&gt;")
  expect(escaped).not.toContain("<script>")
})
