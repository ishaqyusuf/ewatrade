import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { StorefrontResources } from "../../../storefront-contracts/src/resources"
import { fixture } from "../fixtures"
import { defaultComposition } from "../registry"
import { StorefrontTemplate } from "../render"
import { retailEditorialManifest } from "../retail-editorial/manifest"
import { serviceDeskManifest } from "../service-desk/manifest"
import { CatalogListingControls } from "./catalog-controls"

const render = (
  manifest: typeof retailEditorialManifest,
  catalog: Partial<StorefrontResources["catalog"]>,
  after?: string,
) => {
  const base = fixture("populated")
  return renderToStaticMarkup(
    <StorefrontTemplate
      snapshot={{
        ...base,
        resources: {
          ...base.resources,
          catalog: { ...base.resources.catalog, ...catalog },
        },
        composition: defaultComposition(manifest),
        mode: "live",
        locale: "en-NG",
        currencyCode: "NGN",
      }}
      domain="fixture-store.ewatrade.com"
      customerChatOrigin=""
      after={after}
      syncUrl
    />,
  )
}

test("the GET form is labelled, carries only category and the three controls, and resets to page one", () => {
  const html = renderToStaticMarkup(
    <CatalogListingControls
      category="cat-a"
      query={{ q: " linen ", availability: "out_of_stock" }}
    />,
  )
  const form = html.match(/<form[^>]*>/)?.[0] ?? ""
  expect(form).toContain('role="search"')
  expect(form).toContain('action="/"')
  expect(form).not.toContain("method=")
  expect(html).toContain('aria-label="Search items"')
  expect(
    [...html.matchAll(/name="([a-z]+)"/g)].map((match) => match[1]),
  ).toEqual(["category", "q", "availability", "sort"])
  expect(html).not.toContain('name="after"')
  expect(html).not.toContain('name="item"')
  expect(html).toContain('type="search"')
  expect(html).toContain('maxLength="120"')
  expect(html).toContain('value="linen"')
  expect(html).toMatch(/<label[^>]*for="[^"]+-q"[^>]*>Search<\/label>/)
  expect(html).toMatch(/<option value="out_of_stock" selected="">Out of stock/)
  expect(html).toMatch(/<option value="" selected="">Default order/)
  // Clear filters resets every listing control, including the category.
  expect(html).toMatch(/href="\/"[^>]*>Clear filters/)
  expect(html).not.toContain("comparable price")
  // A category alone is still a listing state Clear filters resets.
  expect(
    renderToStaticMarkup(<CatalogListingControls category="cat-a" />),
  ).toMatch(/href="\/"[^>]*>Clear filters/)
  // Nothing applied, nothing to clear.
  expect(renderToStaticMarkup(<CatalogListingControls />)).not.toContain(
    "Clear",
  )
})

test("an applied price sort explains where items without comparable prices go", () => {
  for (const sort of ["price_asc", "price_desc"] as const) {
    const html = renderToStaticMarkup(
      <CatalogListingControls query={{ sort }} />,
    )
    const note = html.match(/<p[^>]*id="([^"]+-sort-note)"[^>]*>([^<]*)</)
    expect(note?.[2]).toBe("Items without a comparable price are listed last.")
    expect(html).toContain(`aria-describedby="${note?.[1]}"`)
  }
  expect(
    renderToStaticMarkup(
      <CatalogListingControls query={{ sort: "name_asc" }} />,
    ),
  ).not.toContain("comparable price")
})

test("shared retail and service collections keep the query on category and pagination links", () => {
  const catalog = {
    categories: [
      { id: "cat-a", name: "Bags" },
      { id: "cat-b", name: "Fittings" },
    ],
    category: "cat-a",
    query: { q: "tote", sort: "name_asc" } as const,
    nextCursor: "s:two",
  }
  for (const manifest of [retailEditorialManifest, serviceDeskManifest]) {
    const html = render(manifest, catalog, "s:one")
    expect(html, manifest.key).toContain('role="search"')
    expect(html, manifest.key).toContain(
      'href="/?category=cat-a&amp;q=tote&amp;sort=name_asc&amp;after=s%3Atwo"',
    )
    expect(html, manifest.key).toContain(
      'href="/?category=cat-a&amp;q=tote&amp;sort=name_asc">Back to start',
    )
  }
  const retail = render(retailEditorialManifest, catalog)
  expect(retail).toContain(
    'href="/?category=cat-b&amp;q=tote&amp;sort=name_asc"',
  )
  expect(retail).toContain('href="/?q=tote&amp;sort=name_asc"')
})

test("a filtered empty shared collection shows the no-results state with a reset", () => {
  const html = render(retailEditorialManifest, {
    items: [],
    highlightedItem: null,
    query: { q: "zzz" },
  })
  expect(html).toContain("No matching items")
  expect(html).toContain('href="/">Clear search</a>')
  expect(html).not.toContain("The collection is being prepared")
})
