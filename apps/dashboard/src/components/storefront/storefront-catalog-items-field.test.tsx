import { expect, test } from "bun:test"
import type { EditableField } from "@ewatrade/storefront-contracts/manifest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  CatalogItemsPicker,
  moveCatalogItem,
  pinCatalogItem,
  unpinCatalogItem,
} from "./storefront-catalog-items-field"

const field = {
  key: "pinned",
  label: "Pinned products",
  kind: "catalog-items",
  maxItems: 3,
  itemKind: "PRODUCT",
  default: [],
} as Extract<EditableField, { kind: "catalog-items" }>

test("pin list edits keep order, never duplicate and respect the field max", () => {
  expect(pinCatalogItem(["a"], "b", 3)).toEqual(["a", "b"])
  expect(pinCatalogItem(["a", "b"], "a", 3)).toEqual(["a", "b"])
  expect(pinCatalogItem(["a", "b", "c"], "d", 3)).toEqual(["a", "b", "c"])
  expect(moveCatalogItem(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"])
  expect(moveCatalogItem(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"])
  expect(moveCatalogItem(["a", "b"], "a", -1)).toEqual(["a", "b"])
  expect(moveCatalogItem(["a", "b"], "b", 1)).toEqual(["a", "b"])
  expect(unpinCatalogItem(["a", "b"], "a")).toEqual(["b"])
})

/** Whether the button with this accessible name renders the `disabled` attribute. */
const disabled = (html: string, label: string) => {
  const tag = html
    .split("<button")
    .find((part) => part.includes(`aria-label="${label}"`))
  if (!tag) throw new Error(`No button ${label}`)
  return tag.slice(0, tag.indexOf(">")).includes(' disabled=""')
}

test("picker shows order, accessible controls, skipped pins and the max", () => {
  const render = (
    entries: Parameters<typeof CatalogItemsPicker>[0]["entries"],
  ) =>
    renderToStaticMarkup(
      createElement(CatalogItemsPicker, {
        field,
        entries,
        candidates: [
          { id: "a", name: "Ankara tote" },
          { id: "d", name: "Linen shirt" },
        ],
        query: "",
        searching: false,
        failed: false,
        disabled: false,
        onQuery: () => {},
        onChange: () => {},
      }),
    )
  const html = render([
    { id: "a", name: "Ankara tote", listed: true },
    { id: "b", name: "Old dress", listed: false },
  ])
  expect(html).toContain("2 of 3")
  expect(disabled(html, "Move Ankara tote down")).toBe(false)
  expect(html).toContain('aria-label="Unpin Old dress"')
  // First row can't move up, last row can't move down.
  expect(disabled(html, "Move Ankara tote up")).toBe(true)
  expect(disabled(html, "Move Old dress down")).toBe(true)
  expect(html).toContain("Not on your website now. It will be skipped.")
  expect(disabled(html, "Ankara tote is pinned")).toBe(true)
  expect(disabled(html, "Pin Linen shirt")).toBe(false)
  expect(html).toContain('aria-live="polite"')
  const full = render([
    { id: "a", name: "Ankara tote", listed: true },
    { id: "b", name: "Old dress", listed: true },
    { id: "c", name: "Cap", listed: true },
  ])
  expect(disabled(full, "Pin Linen shirt")).toBe(true)
  expect(full).toContain("You can pin up to 3.")
  expect(render([])).toContain("No pinned products.")
  const loading = render([
    { id: "z", name: null, listed: false, pending: true },
  ])
  expect(loading).toContain("Loading item…")
  expect(loading).not.toContain("It will be skipped.")
  expect(render([{ id: "z", name: null, listed: false }])).toContain(
    "Unavailable item",
  )
})
