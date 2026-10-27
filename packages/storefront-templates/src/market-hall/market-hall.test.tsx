import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  assertCompositionSources,
  validateComposition,
} from "../../../storefront-contracts/src/manifest"
import type {
  PublicCatalogItem,
  StorefrontResources,
} from "../../../storefront-contracts/src/resources"
import { loadStorefront } from "../../../storefront-runtime/src/server"
import {
  canvasEditableManifests,
  isCanvasManifest,
  portableSectionKind,
} from "../canvas/catalog"
import {
  buildSectionLibrary,
  canvasDefaults,
  canvasManifest,
  canvasPage,
  insertSectionExcerpt,
  isCanvasComposition,
  upgradeCanvasDraft,
} from "../canvas/library"
import {
  canvasFamilies,
  canvasManifests,
  canvasSections,
} from "../canvas/manifests"
import { fixture } from "../fixtures"
import {
  getTemplateManifest,
  listSelectableTemplates,
  replaceDraftTemplate,
  templateInventory,
  templateRegistry,
} from "../registry"
import { StorefrontTemplate } from "../render"
import { marketHallManifest, marketHallSections } from "./manifest"
import { marketHallFeature, marketHallSplit } from "./render"

const legacyKeys: string[] = canvasFamilies.map((entry) => entry.key)
const legacyManifests = canvasManifests.filter((entry) =>
  legacyKeys.includes(entry.key),
)
const item = (
  id: string,
  kind: "PRODUCT" | "SERVICE",
  extra: Partial<PublicCatalogItem> = {},
): PublicCatalogItem => ({
  id,
  name: `Item ${id}`,
  kind,
  description: null,
  category: { id: "cat-a", name: "Baskets" },
  illustrationId: "default",
  currencyCode: "NGN",
  priceMinor: 250000,
  isFromPrice: false,
  availability: null,
  options: [],
  ...extra,
})
function snapshot(
  catalog: Partial<StorefrontResources["catalog"]> = {},
  mode: "live" | "preview" = "live",
) {
  const base = fixture("populated")
  return {
    ...base,
    resources: {
      ...base.resources,
      catalog: { ...base.resources.catalog, ...catalog },
    },
    composition: canvasDefaults(marketHallManifest),
    mode,
    locale: "en-NG",
    currencyCode: "NGN",
  }
}
const render = (
  value: ReturnType<typeof snapshot>,
  options: { pageKey?: string; after?: string; syncUrl?: boolean } = {},
) =>
  renderToStaticMarkup(
    <StorefrontTemplate
      snapshot={value}
      domain="fixture.localhost"
      customerChatOrigin=""
      {...options}
    />,
  )

test("market-hall@1.0.0 is a separate 32-section pin; the four 2.0.0 canvas pins stay unchanged", () => {
  expect(marketHallManifest.key).toBe("market-hall")
  expect(marketHallManifest.version).toBe("1.0.0")
  expect(marketHallManifest.sections).toHaveLength(32)
  expect(marketHallManifest.sections[0]?.key).toBe("studio-header")
  expect(marketHallManifest.sections.at(-1)?.key).toBe("studio-footer")
  const portable = canvasSections.filter((section) =>
    legacyKeys.includes(section.source?.templateKey ?? ""),
  )
  expect(portable).toHaveLength(28)
  for (const section of portable)
    expect(
      marketHallManifest.sections.find((entry) => entry.key === section.key),
    ).toEqual(section)
  for (const section of marketHallSections)
    expect(section.source).toEqual({
      templateKey: "market-hall",
      templateVersion: "1.0.0",
      sectionKey: section.key,
      sectionVersion: 1,
    })
  expect(legacyManifests).toHaveLength(4)
  for (const manifest of legacyManifests) {
    expect(manifest.version).toBe("2.0.0")
    expect(manifest.sections).toHaveLength(30)
    for (const page of manifest.pages)
      expect(
        page.allowedSections.some((key) => key.startsWith("market-hall-")),
      ).toBe(false)
  }
  for (const page of marketHallManifest.pages)
    expect(page.allowedSections).toHaveLength(32)
})

test("registry, selection, replacement and inventory see Market hall as a canvas-editable exact pin", () => {
  const pin = { key: "market-hall", version: "1.0.0" }
  expect(
    listSelectableTemplates().some(
      (entry) => entry.manifest === marketHallManifest,
    ),
  ).toBe(true)
  expect(isCanvasManifest(pin)).toBe(true)
  expect(isCanvasManifest({ key: "market-hall", version: "2.0.0" })).toBe(false)
  expect(canvasEditableManifests).toContain(marketHallManifest)
  expect(canvasManifest("market-hall")).toBe(marketHallManifest)
  const draft = canvasDefaults(marketHallManifest)
  expect(getTemplateManifest(draft, "new-use")).toBe(marketHallManifest)
  expect(isCanvasComposition(draft)).toBe(true)
  expect(upgradeCanvasDraft(draft)).toBe(draft)
  expect(canvasPage(draft, "home").sections.map((entry) => entry.type)).toEqual(
    [
      "studio-header",
      "market-hall-floor",
      "market-hall-counter",
      "studio-footer",
    ],
  )
  const legacy = canvasDefaults(canvasManifest("catalog-v4"))
  legacy.theme.accent = "#224466"
  const replaced = replaceDraftTemplate(legacy, pin)
  expect(replaced.template).toEqual(pin)
  expect(replaced.theme.accent).toBe("#224466")
  expect(
    templateInventory().find((entry) => entry.key === "market-hall"),
  ).toMatchObject({
    version: "1.0.0",
    source: "packages/storefront-templates/src/market-hall",
    registration: "runtime-registered",
    qualification: "qualified",
    release: "not-live",
  })
})

test("section library lists Market hall sections under their own source and only valid destinations accept them", () => {
  const library = buildSectionLibrary(canvasEditableManifests)
  const own = library.filter((entry) => entry.template.key === "market-hall")
  expect(own.map((entry) => [entry.definition.key, entry.kind])).toEqual([
    ["market-hall-floor", "floor"],
    ["market-hall-counter", "counter"],
  ])
  for (const entry of library)
    expect(entry.definition.source?.templateKey).toBe(entry.template.key)
  const floor = own[0]
  const faq = library.find(
    (entry) =>
      entry.kind === "faq" && entry.template.key === "retail-editorial",
  )
  if (!floor || !faq) throw new Error("Missing library entries")
  expect(() =>
    insertSectionExcerpt(
      canvasDefaults(canvasManifest("catalog-v4")),
      "home",
      floor,
      "hall-floor",
    ),
  ).toThrow()
  const hall = insertSectionExcerpt(
    insertSectionExcerpt(
      canvasDefaults(marketHallManifest),
      "about",
      floor,
      "x",
    ),
    "home",
    faq,
    "portable-faq",
  )
  expect(canvasPage(hall, "home").sections.at(-1)?.type).toBe("studio-footer")
  expect(() =>
    assertCompositionSources(hall, (pin) =>
      getTemplateManifest({ template: pin }, "new-use"),
    ),
  ).not.toThrow()
  expect(portableSectionKind("market-hall-counter")).toBe("counter")
})

test("live load declares catalog and contact access and stays within resource caps", async () => {
  const composition = canvasDefaults(marketHallManifest)
  const result = await loadStorefront({
    registry: templateRegistry,
    resolveSite: async () => ({
      composition,
      scope: {
        tenantId: "synthetic",
        siteId: "synthetic-site",
        storeId: "synthetic-store",
        releaseId: "synthetic-release",
        mode: "live",
        locale: "en-NG",
        currencyCode: "NGN",
      },
    }),
    loadResources: async () => fixture("populated"),
  })
  if (result.status !== "ready") throw new Error(JSON.stringify(result))
  expect(result.snapshot.resources.catalog.items).toHaveLength(2)
  expect(result.snapshot.capabilities.conversation.available).toBe(true)
  validateComposition(result.snapshot.composition, marketHallManifest)
})

test("split and feature are deterministic and never drop loaded items", () => {
  const items = [
    item("p1", "PRODUCT", { availability: "OUT_OF_STOCK" }),
    item("s1", "SERVICE"),
    item("p2", "PRODUCT"),
    item("p3", "PRODUCT", { photoUrl: "https://example.test/p3.jpg" }),
  ]
  const mixed = marketHallSplit(items)
  expect(mixed.floor.map((entry) => entry.id)).toEqual(["p1", "p2", "p3"])
  expect(mixed.counter.map((entry) => entry.id)).toEqual(["s1"])
  expect(marketHallFeature(mixed.floor)?.id).toBe("p3")
  expect(marketHallFeature([items[0] as PublicCatalogItem])?.id).toBe("p1")
  const services = marketHallSplit([
    item("s1", "SERVICE"),
    item("s2", "SERVICE"),
  ])
  expect(services.floor.map((entry) => entry.id)).toEqual(["s1", "s2"])
  expect(services.counter).toHaveLength(0)
  expect(marketHallFeature([])).toBeNull()
})

test("mixed catalog renders the floor, every board item, the services counter and real category links", () => {
  const html = render(
    snapshot({
      items: [
        item("p1", "PRODUCT", { name: "Raffia basket" }),
        item("p2", "PRODUCT", { name: "Painted tray" }),
        item("s1", "SERVICE", {
          name: "Hem alteration",
          description: "Shorten",
        }),
      ],
      categories: [
        { id: "cat-a", name: "Baskets" },
        { id: "cat-b", name: "Trays" },
      ],
      category: "cat-b",
    }),
    { syncUrl: true },
  )
  expect(html).toContain("Fixture Store")
  expect(html).toContain('role="tablist"')
  expect(html).toContain('href="/?category=cat-a"')
  expect(html).toMatch(
    /aria-selected="true"[^>]*href="\/\?category=cat-b"|href="\/\?category=cat-b"[^>]*aria-selected="true"/,
  )
  expect(html).toContain("Prices in this collection")
  expect(html).toContain('href="/?item=p1"')
  expect(html).toContain('href="/?item=p2"')
  expect(html).toContain("View details")
  expect(html).toContain("Hem alteration")
  expect(html).toContain('aria-label="View service: Hem alteration"')
  expect(html).not.toContain("testimonial")
  // Embedded previews never render history links.
  const embedded = render(snapshot())
  expect(embedded).not.toContain('href="?item=')
})

test("service-only catalog features services on the floor and omits the empty live counter", () => {
  const html = render(
    snapshot({ items: [item("s1", "SERVICE", { name: "Bespoke kaftan" })] }),
  )
  expect(html).toContain("View service")
  expect(html).toContain("Bespoke kaftan")
  expect(html).not.toContain("cv-counter")
  expect(html).not.toContain('role="tablist"')
})

test("empty and paged catalogs show honest states and keep server pagination", () => {
  const empty = render(snapshot({ items: [], category: "cat-a" }))
  expect(empty).toContain("Nothing in this category yet")
  expect(empty).toContain("Show all items")
  const paged = render(
    snapshot({
      category: "cat-a",
      nextCursor: "a:item-2",
      hasHiddenItems: true,
    }),
    { after: "a:item-0" },
  )
  expect(paged).toContain('href="/?category=cat-a&amp;after=a%3Aitem-2"')
  expect(paged).toContain("Back to start")
  expect(paged).toContain("A selection of this shop’s items is shown.")
})

test("listing controls keep search, availability and sort across category, pagination and first-page links", () => {
  const html = render(
    snapshot({
      categories: [
        { id: "cat-a", name: "Baskets" },
        { id: "cat-b", name: "Trays" },
      ],
      category: "cat-a",
      query: { q: "  raffia  ", availability: "available", sort: "name_desc" },
      nextCursor: "s:cursor-2",
    }),
    { after: "s:cursor-1", syncUrl: true },
  )
  expect(html).toContain('role="search"')
  expect(html).toContain('name="category" value="cat-a"')
  expect(html).toContain('value="raffia"')
  expect(html).toMatch(/<option value="available" selected="">Not out of stock/)
  expect(html).toMatch(/<option value="name_desc" selected="">Name Z–A/)
  // Category tabs keep the controls and drop the cursor.
  expect(html).toContain(
    'href="/?category=cat-b&amp;q=raffia&amp;availability=available&amp;sort=name_desc"',
  )
  expect(html).toContain(
    'href="/?q=raffia&amp;availability=available&amp;sort=name_desc"',
  )
  // Pagination and Back to start keep every control.
  expect(html).toContain(
    'href="/?category=cat-a&amp;q=raffia&amp;availability=available&amp;sort=name_desc&amp;after=s%3Acursor-2"',
  )
  expect(html).toContain(
    'href="/?category=cat-a&amp;q=raffia&amp;availability=available&amp;sort=name_desc">Back to start',
  )
  // Clear filters resets category, search, filter, sort and cursor together.
  expect(html).toMatch(/href="\/"[^>]*>Clear filters/)
})

test("a narrowed listing with no matches says so and offers the reset, not the empty-shop copy", () => {
  const html = render(
    snapshot({ items: [], query: { availability: "out_of_stock" } }),
  )
  expect(html).toContain("No matching items")
  expect(html).toMatch(/href="\/"[^>]*>Clear search/)
  expect(html).not.toContain("The collection is being prepared")
  // A sort alone never hides items, so a truly empty shop keeps its own copy.
  const sorted = render(snapshot({ items: [], query: { sort: "price_asc" } }))
  expect(sorted).toContain("The collection is being prepared")
  expect(sorted).toContain('role="search"')
})

test("About page reuses portable sections with real business facts; copy stays escaped", () => {
  const value = snapshot()
  const home = canvasPage(value.composition, "home").sections[1]
  if (!home) throw new Error("Missing floor")
  home.settings.headline = "<b>Raffia & Co</b>"
  const html = render(value)
  expect(html).toContain("&lt;b&gt;Raffia &amp; Co&lt;/b&gt;")
  expect(html).not.toContain("<b>Raffia")
  const about = render(value, { pageKey: "about" })
  expect(about).toContain("Synthetic fixture data.")
  expect(about).toContain('data-source-template="catalog-v4"')
  expect(about).not.toContain("What customers say")
})
