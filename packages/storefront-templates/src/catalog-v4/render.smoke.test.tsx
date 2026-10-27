import { expect, test } from "bun:test"
import { renderToString } from "react-dom/server"
import { validateComposition } from "../../../storefront-contracts/src/manifest"
import { fixture } from "../fixtures"
import { defaultComposition } from "../registry"
import { StorefrontTemplate } from "../render"
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

test("listing controls echo the server query into category, pagination and no-results links", () => {
  const listed = {
    ...store,
    category: "cat-1",
    query: { q: "tote", availability: "available", sort: "price_asc" } as const,
    nextCursor: "s:page-2",
  }
  const html = renderToString(
    <CatalogV4
      composition={defaultComposition(catalogV4Manifest)}
      store={listed}
      domain="fixture-store.ewatrade.com"
      customerChatOrigin="https://chat.example"
      after="s:page-1"
    />,
  )
  const controls = "q=tote&amp;availability=available&amp;sort=price_asc"
  expect(html).toContain('role="search"')
  expect(html).toContain(`href="/?category=cat-2&amp;${controls}"`)
  expect(html).toContain(`href="/?${controls}"`)
  expect(html).toContain(
    `href="/?category=cat-1&amp;${controls}&amp;after=s%3Apage-2"`,
  )
  expect(html).toContain(
    `href="/?category=cat-1&amp;${controls}">Back to start`,
  )
  const empty = renderToString(
    <CatalogV4
      composition={defaultComposition(catalogV4Manifest)}
      store={{ ...listed, items: [], nextCursor: null }}
      domain="fixture-store.ewatrade.com"
      customerChatOrigin="https://chat.example"
    />,
  )
  expect(empty).toContain("No matching items")
  expect(empty).toMatch(/href="\/\?category=cat-1"[^>]*>Clear search/)
  expect(empty).not.toContain("New items are on the way")
})

// The portalled detail Dialog is not in SSR markup; open/Back/focus need the browser session.
test("host (syncUrl) and embedded renders both keep canonical item hrefs for new-tab/modified clicks", () => {
  const base = fixture("populated")
  const snapshot = {
    ...base,
    composition: defaultComposition(catalogV4Manifest),
    mode: "live" as const,
    locale: "en-NG",
    currencyCode: "NGN",
  }
  for (const syncUrl of [true, false, undefined]) {
    const html = renderToString(
      <StorefrontTemplate
        snapshot={snapshot}
        domain="fixture-store.ewatrade.com"
        customerChatOrigin=""
        syncUrl={syncUrl}
      />,
    )
    expect(html, String(syncUrl)).toContain('href="/?item=item-1"')
    expect(html, String(syncUrl)).toContain('href="/?item=item-2"')
  }
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
