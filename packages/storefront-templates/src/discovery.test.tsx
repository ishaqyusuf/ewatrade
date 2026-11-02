import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { fixture } from "./fixtures"
import { defaultComposition, templateRegistry } from "./registry"
import { StorefrontTemplate } from "./render"

test("every registered template renders crawlable public item links and EwaTrade attribution", () => {
  for (const entry of templateRegistry) {
    if (entry.status.qualification !== "qualified") continue
    const snapshot = {
      ...fixture("populated"),
      mode: "live" as const,
      locale: "en-NG",
      currencyCode: "NGN",
      composition: defaultComposition(entry.manifest),
    }
    const html = renderToStaticMarkup(
      <StorefrontTemplate
        snapshot={snapshot}
        domain="fixture-store.ewatrade.com"
        customerChatOrigin="https://chat.example"
        syncUrl
      />,
    )
    expect(html, `${entry.manifest.key}@${entry.manifest.version}`).toMatch(
      /href="\/\?item=item-[12]"/,
    )
    if (html.includes("Ankara tote"))
      expect(html).toContain('href="/?item=item-1"')
    if (html.includes("Tailoring fitting"))
      expect(html).toContain('href="/?item=item-2"')
    expect(html).toContain(
      '<a href="https://ewatrade.com/" data-storefront-event="storefront_backlink_clicked">Powered by',
    )
  }
})

test("every template that shows category navigation adds the active root's subcategories", () => {
  const base = fixture("populated")
  const categories = [
    {
      id: "cat-1",
      name: "Clothing",
      subcategories: [
        { id: "sub-1", name: "Shirts" },
        { id: "sub-2", name: "Trousers" },
      ],
    },
    { id: "cat-2", name: "Shoes", subcategories: [] },
  ]
  let covered = 0
  for (const entry of templateRegistry) {
    if (entry.status.qualification !== "qualified") continue
    const composition = defaultComposition(entry.manifest)
    for (const page of composition.pages)
      for (const section of page.sections)
        if ("show-categories" in section.settings)
          section.settings["show-categories"] = true
    const html = renderToStaticMarkup(
      <StorefrontTemplate
        snapshot={{
          ...base,
          resources: {
            ...base.resources,
            catalog: {
              ...base.resources.catalog,
              categories,
              category: "cat-1",
              subcategory: "sub-2",
            },
          },
          mode: "live" as const,
          locale: "en-NG",
          currencyCode: "NGN",
          composition,
        }}
        domain="fixture-store.ewatrade.com"
        customerChatOrigin="https://chat.example"
        pageKey={entry.manifest.key === "commerce-studio" ? "shop" : "home"}
      />,
    )
    const label = `${entry.manifest.key}@${entry.manifest.version}`
    if (!html.includes('aria-label="Categories"')) continue
    covered++
    expect(html, label).toContain('aria-label="Subcategories"')
    expect(html, label).toMatch(
      /href="\/(shop)?\?category=cat-1&amp;subcategory=sub-1"/,
    )
    expect(html, label).toMatch(/aria-current="page"[^>]*>Trousers/)
    // The root stays marked as the current page's parent, not the page itself.
    expect(html, label).not.toMatch(/aria-current="page"[^>]*>Clothing/)
    if (html.includes('role="search"'))
      expect(html, label).toContain('name="subcategory" value="sub-2"')
  }
  expect(covered).toBeGreaterThanOrEqual(4)
})
