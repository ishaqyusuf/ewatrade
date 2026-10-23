import { expect, test } from "bun:test"
import { renderToString } from "react-dom/server"
import { validateComposition } from "../../../storefront-contracts/src/manifest"
import { fixture } from "../fixtures"
import { defaultComposition } from "../registry"
import { catalogV4Manifest } from "./manifest"
import { CatalogV4 } from "./render"

const { business, catalog, contact } = fixture("populated").resources
const store = {
  ...business,
  ...catalog,
  ...contact,
  categories: [...catalog.categories, { id: "cat-2", name: "Services" }],
}
const render = (composition = defaultComposition(catalogV4Manifest)) =>
  renderToString(
    <CatalogV4
      composition={composition}
      store={store}
      domain="fixture-store.ewatrade.com"
      customerChatOrigin="https://chat.example"
    />,
  )

test("default composition keeps accepted Catalog v4 output", () => {
  const html = render()
  expect(html).toContain('<p class="sf-lede">Synthetic fixture data.</p>')
  expect(html).toContain('aria-label="Categories"')
  expect(html).toContain("fixture-store.ewatrade.com")
  expect(html).not.toContain("style=")
  expect(html.indexOf("<h1>")).toBeLessThan(
    html.indexOf("storefront-catalog-heading"),
  )
})

test("saved order, visibility and settings change the output", () => {
  const draft = structuredClone(defaultComposition(catalogV4Manifest))
  const page = draft.pages[0]
  const [header, list, footer] = page?.sections ?? []
  if (!page || !header || !list || !footer)
    throw new Error("Catalog v4 home sections missing")
  header.settings.tagline = "Hand-made bags"
  list.settings["show-categories"] = false
  footer.visible = false
  page.sections = [list, header, footer]
  const html = render(validateComposition(draft, catalogV4Manifest))
  expect(html).toContain('<p class="sf-lede">Hand-made bags</p>')
  expect(html).not.toContain('aria-label="Categories"')
  expect(html).not.toContain("fixture-store.ewatrade.com")
  expect(html.indexOf("storefront-catalog-heading")).toBeLessThan(
    html.indexOf("<h1>"),
  )
  footer.visible = true
  page.sections = [list, footer, header]
  draft.theme.font = "serif"
  draft.theme.radius = "rounded"
  const reordered = render(validateComposition(draft, catalogV4Manifest))
  expect(reordered.indexOf("fixture-store.ewatrade.com")).toBeLessThan(
    reordered.indexOf("<h1>"),
  )
  expect(reordered).toContain("Georgia, serif")
  expect(reordered).toContain("--sf-corner-radius:12px")
  expect((reordered.match(/<main>/g) ?? []).length).toBe(1)
})
