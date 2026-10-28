import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  type StorefrontComposition,
  validateComposition,
} from "../../../storefront-contracts/src/manifest"
import { publicLowStockCountsEnabled } from "../../../storefront-contracts/src/orders"
import type {
  PublicCatalogItem,
  StorefrontResources,
} from "../../../storefront-contracts/src/resources"
import { canvasDefaults } from "../canvas/library"
import { fixture } from "../fixtures"
import {
  getTemplateManifest,
  migrateCommerceStudioFeaturedDraft,
  migrateCommerceStudioMediaDraft,
  pinnedCatalogItemIds,
  upgradeDraftVersion,
  withLowStockCountSetting,
  withPinnedCatalogItems,
} from "../registry"
import { StorefrontTemplate } from "../render"
import { catalogListingPathHref } from "../shared/catalog-listing"
import type { AccountView } from "./account"
import { commerceStudioManifest } from "./manifest"
import { featuredItems } from "./render"

const pin = (version: string) =>
  getTemplateManifest(
    { template: { key: "commerce-studio", version } },
    "render",
  )

const item = (
  id: string,
  extra: Partial<PublicCatalogItem> = {},
): PublicCatalogItem => ({
  id,
  name: `Item ${id}`,
  kind: "PRODUCT",
  description: null,
  category: { id: "cat-a", name: "Baskets" },
  illustrationId: "default",
  currencyCode: "NGN",
  priceMinor: 250000,
  isFromPrice: false,
  availability: null,
  options: [
    {
      id: `${id}-o`,
      name: "Default",
      priceMinor: 250000,
      currencyCode: "NGN",
      availability: null,
      stock: "in_stock",
      unit: { label: "piece", scale: 0 },
    },
  ],
  ...extra,
})

const accountsOn: NonNullable<StorefrontResources["commerce"]> = {
  orderRequests: { available: true },
  customerAccounts: { available: true, channels: ["email", "whatsapp"] },
  fulfilment: ["pickup"],
  hasContact: true,
}

function snapshot(
  composition: StorefrontComposition,
  catalog: Partial<StorefrontResources["catalog"]> = {},
  extra: Partial<StorefrontResources> = {},
) {
  const base = fixture("populated")
  return {
    ...base,
    resources: {
      ...base.resources,
      ...extra,
      catalog: { ...base.resources.catalog, ...catalog },
      contact: { chatToken: null, whatsAppPhone: null },
    },
    composition,
    mode: "live" as const,
    locale: "en-NG",
    currencyCode: "NGN",
  }
}
const render = (
  value: ReturnType<typeof snapshot>,
  pageKey = "home",
  route?: Parameters<typeof StorefrontTemplate>[0]["route"],
) =>
  renderToStaticMarkup(
    <StorefrontTemplate
      snapshot={value}
      domain="shop.test"
      customerChatOrigin="https://chat.test"
      pageKey={pageKey}
      route={route}
    />,
  )

const section = (composition: StorefrontComposition, type: string) => {
  const found = composition.pages
    .flatMap((page) => page.sections)
    .find((entry) => entry.type === `commerce-studio-${type}`)
  if (!found) throw new Error(`${type} missing`)
  return found
}
const sectionHtml = (html: string, className: string) => {
  const start = html.indexOf(`<section class="${className}"`)
  return start < 0 ? "" : html.slice(start, html.indexOf("</section>", start))
}
const current = () => canvasDefaults(commerceStudioManifest)
const products = (count: number) =>
  Array.from({ length: count }, (_, index) => item(`p${index}`))

test("one named storefront container per rendered template surface", () => {
  const html = render(snapshot(current(), { items: products(4) }))
  expect(html.match(/class="sf-template-viewport"/g)?.length).toBe(1)
  expect(html.indexOf("sf-template-viewport")).toBeLessThan(
    html.indexOf("cs-store"),
  )
})

test("1.2.0 is the current pin; 1.0.0 and 1.1.0 stay registered and refuse the new fields", () => {
  expect(commerceStudioManifest.version).toBe("1.2.0")
  for (const version of ["1.0.0", "1.1.0"]) {
    const old = canvasDefaults(pin(version))
    expect(validateComposition(old, pin(version)).template.version).toBe(
      version,
    )
    for (const [type, key, value] of [
      ["hero", "image", []],
      ["hero", "shop-label", "Browse"],
      ["story", "show-link", true],
      ["catalog", "columns", "four"],
      ["header", "show-low-stock-count", true],
    ] as const) {
      const smuggled = structuredClone(old)
      section(smuggled, type).settings[key] = value as never
      expect(() => validateComposition(smuggled, pin(version))).toThrow(
        `Unknown editable field ${key}`,
      )
    }
  }
  // New fields keep the contract's bounded types: one ID, no URLs, known selects.
  const composition = current()
  expect(validateComposition(composition, commerceStudioManifest)).toBeTruthy()
  for (const [type, key, value] of [
    ["hero", "image", ["a", "b"]],
    ["hero", "image", ["https://evil.test/a.jpg"]],
    ["story", "image", ["../private/asset"]],
    ["featured", "columns", "five"],
    ["story", "image-side", "left"],
    ["hero", "image-alt", "<script>alert(1)</script>"],
    ["hero", "shop-label", "x".repeat(41)],
  ] as const) {
    const invalid = structuredClone(composition)
    section(invalid, type).settings[key] = value as never
    expect(() => validateComposition(invalid, commerceStudioManifest)).toThrow()
  }
})

test("1.1.0 → 1.2.0 is explicit, keeps every setting and pin, and renders the same page", () => {
  const old = migrateCommerceStudioFeaturedDraft(canvasDefaults(pin("1.0.0")))
  section(old, "featured").settings.pinned = ["p2"]
  section(old, "hero").settings.headline = "Merchant headline"
  section(old, "story").settings.body = "We weave baskets."
  const before = JSON.stringify(old)
  const next = migrateCommerceStudioMediaDraft(old)
  expect(JSON.stringify(old)).toBe(before)
  expect(upgradeDraftVersion(old)).toEqual(next)
  expect(next.template.version).toBe("1.2.0")
  expect(section(next, "featured")).toMatchObject({
    version: 3,
    settings: { pinned: ["p2"], columns: "auto" },
  })
  expect(section(next, "hero")).toMatchObject({
    version: 2,
    settings: {
      headline: "Merchant headline",
      image: [],
      "image-alt": "",
      "shop-label": "",
      "services-label": "",
    },
  })
  expect(section(next, "story").settings).toMatchObject({
    body: "We weave baskets.",
    image: [],
    "image-side": "start",
    "show-link": true,
  })
  // Unrevised sections keep their exact source pin.
  expect(section(next, "faq").source?.templateVersion).toBe("1.0.0")
  // Low-stock counts stay off after an upgrade until the merchant opts in.
  expect(section(next, "header")).toMatchObject({
    version: 2,
    settings: { "show-low-stock-count": false },
  })
  expect(publicLowStockCountsEnabled(next)).toBe(false)
  expect(() => migrateCommerceStudioMediaDraft(next)).toThrow()
  expect(() =>
    migrateCommerceStudioMediaDraft(canvasDefaults(pin("1.0.0"))),
  ).toThrow()
  // Same data, same page: only the Home story link is new, and it is opt-out.
  section(next, "story").settings["show-link"] = false
  const data = { items: products(5) }
  expect(render(snapshot(next, data))).toBe(render(snapshot(old, data)))
  expect(render(snapshot(next, data), "shop")).toBe(
    render(snapshot(old, data), "shop"),
  )
})

test("hero photo comes only from a public product; alt is merchant text or the item name", () => {
  const composition = current()
  const hero = section(composition, "hero")
  hero.settings.image = ["p1"]
  hero.settings["image-alt"] = "Baskets drying in the morning sun"
  const photo = item("p1", { photoUrl: "/qa-photo/p1.webp" })
  let html = sectionHtml(
    render(snapshot(composition, { items: [item("p0"), photo] })),
    "cs-hero",
  )
  expect(html).toContain('data-media="photo"')
  expect(html).toMatch(
    /<img src="\/qa-photo\/p1.webp" alt="Baskets drying in the morning sun"/,
  )
  expect(html).not.toContain("cs-hero__caption")
  hero.settings["image-alt"] = ""
  html = render(snapshot(composition, { items: [item("p0"), photo] }))
  expect(html).toContain('alt="Item p1"')
  // A pinned public item past the loaded page still resolves.
  html = render(
    snapshot(composition, { items: [item("p0")], pinnedItems: [photo] }),
  )
  expect(sectionHtml(html, "cs-hero")).toContain('src="/qa-photo/p1.webp"')
  // No photo yet: the chosen product's catalog artwork, linked like before.
  html = sectionHtml(
    render(snapshot(composition, { items: [item("p0"), item("p1")] })),
    "cs-hero",
  )
  expect(html).toContain('data-media="item"')
  expect(html).toContain('aria-label="View Item p1"')
  expect(html).not.toContain("<img")
  // Hidden/archived/off-Store (absent) or a service ID: automatic fallback, no error.
  hero.settings.image = ["gone"]
  html = sectionHtml(
    render(snapshot(composition, { items: products(2) })),
    "cs-hero",
  )
  expect(html).toContain('data-media="none"')
  hero.settings.image = ["svc"]
  html = sectionHtml(
    render(
      snapshot(composition, {
        items: [
          item("svc", { kind: "SERVICE", photoUrl: "/qa-photo/svc.webp" }),
        ],
      }),
    ),
    "cs-hero",
  )
  // The service is never the merchant-chosen photo; the older automatic pick still applies.
  expect(html).not.toContain('data-media="photo"')
  expect(html).not.toContain("cs-hero__media--photo")
})

test("low-stock count opt-in: default off, wording only with a server count, preview carries the flag", () => {
  const composition = current()
  expect(section(composition, "header").settings["show-low-stock-count"]).toBe(
    false,
  )
  expect(publicLowStockCountsEnabled(composition)).toBe(false)
  section(composition, "header").settings["show-low-stock-count"] = true
  expect(publicLowStockCountsEnabled(composition)).toBe(true)
  const low = (quantity?: string) =>
    item("p0", {
      options: [
        {
          id: "p0-o",
          name: "Default",
          priceMinor: 250000,
          currencyCode: "NGN",
          availability: null,
          stock: "low_stock",
          unit: { label: "piece", scale: 0 },
          ...(quantity ? { lowStockQuantity: quantity } : {}),
        },
      ],
    })
  const data = (entry: PublicCatalogItem) => ({
    items: [entry, item("p1"), item("p2")],
  })
  expect(render(snapshot(composition, data(low("2"))))).toContain("Only 2 left")
  // No count from the server: the coarse wording, never a guess.
  const coarse = render(snapshot(composition, data(low())))
  expect(coarse).toContain("Low stock")
  expect(coarse).not.toContain("left<")
  // Studio's preview resource design carries only the flag, on its own copy.
  const defaults = current()
  const flagged = withLowStockCountSetting(defaults, true)
  expect(publicLowStockCountsEnabled(flagged)).toBe(true)
  expect(publicLowStockCountsEnabled(defaults)).toBe(false)
  expect(
    publicLowStockCountsEnabled(withLowStockCountSetting(flagged, false)),
  ).toBe(false)
  // Older pins have no such setting and are returned unchanged.
  const old = canvasDefaults(pin("1.1.0"))
  expect(withLowStockCountSetting(old, true)).toBe(old)
})

test("hero button text is editable with honest defaults", () => {
  const composition = current()
  const both = {
    items: [item("p0"), item("svc", { kind: "SERVICE" })],
    offeringCounts: { products: 1, services: 1 },
  }
  let html = sectionHtml(render(snapshot(composition, both)), "cs-hero")
  expect(html).toContain(">Shop now</a>")
  expect(html).toContain(">See services</a>")
  section(composition, "hero").settings["shop-label"] = "Browse the baskets"
  section(composition, "hero").settings["services-label"] = "Book a fitting"
  html = sectionHtml(render(snapshot(composition, both)), "cs-hero")
  expect(html).toContain(">Browse the baskets</a>")
  expect(html).toContain(">Book a fitting</a>")
})

test("Featured and Shop take an explicit 3 or 4 column choice, auto by default", () => {
  const columns = (html: string) =>
    [...html.matchAll(/data-columns="(\d)"/g)].map((match) => match[1])
  const composition = current()
  const data = {
    items: products(4),
    offeringCounts: { products: 4, services: 0 },
  }
  expect(columns(render(snapshot(composition, data)))).toEqual(["4"])
  section(composition, "featured").settings.columns = "three"
  expect(columns(render(snapshot(composition, data)))).toEqual(["3"])
  section(composition, "catalog").settings.columns = "four"
  const five = {
    items: products(5),
    offeringCounts: { products: 5, services: 0 },
  }
  expect(columns(render(snapshot(composition, five), "shop"))).toEqual(["4"])
  section(composition, "catalog").settings.columns = "auto"
  expect(columns(render(snapshot(composition, five), "shop"))).toEqual(["3"])
})

test("story photo, layout and Home link; text-only stories keep their markup", () => {
  const composition = current()
  const story = section(composition, "story")
  story.settings.body = "We weave baskets.\n\nEvery one is signed."
  const data = { items: products(2) }
  let html = sectionHtml(
    render(snapshot(composition, data)),
    "cs-section cs-story",
  )
  expect(html).toContain('<div class="cs-wrap cs-prose">')
  expect(html).toContain('href="/about"')
  expect(html).toContain("Read our story")
  story.settings["link-label"] = "Meet the weavers"
  story.settings.image = ["p1"]
  story.settings["image-side"] = "end"
  story.settings["image-alt"] = "Weaver at work"
  html = render(
    snapshot(composition, {
      items: [item("p0"), item("p1", { photoUrl: "/qa-photo/p1.webp" })],
    }),
  )
  const media = sectionHtml(html, "cs-section cs-story")
  expect(media).toContain('data-side="end"')
  expect(media).toContain('alt="Weaver at work"')
  expect(media).toContain("Meet the weavers")
  // No photo yet: catalog artwork; no figure without a public product.
  html = sectionHtml(render(snapshot(composition, data)), "cs-section cs-story")
  expect(html).toContain("cs-story__media")
  expect(html).not.toContain("<img")
  story.settings.image = ["gone"]
  html = sectionHtml(render(snapshot(composition, data)), "cs-section cs-story")
  expect(html).not.toContain("cs-story__media")
  // The standalone page never links to itself; the link can be turned off.
  expect(render(snapshot(composition, data), "about")).not.toContain(
    "Meet the weavers",
  )
  story.settings["show-link"] = false
  expect(render(snapshot(composition, data))).not.toContain("Meet the weavers")
})

test("hero and story photos load as pins; Featured never auto-picks them", () => {
  const composition = current()
  section(composition, "hero").settings.image = ["h"]
  section(composition, "story").settings.image = ["s"]
  section(composition, "featured").settings.pinned = ["f"]
  expect(pinnedCatalogItemIds(composition)).toEqual(["h", "f", "s"])
  section(composition, "story").visible = false
  expect(pinnedCatalogItemIds(composition)).toEqual(["h", "f"])
  const preview = withPinnedCatalogItems(current(), ["a", "b", "c"])
  expect(section(preview, "hero").settings.image).toEqual(["a"])
  expect(section(preview, "featured").settings.pinned).toEqual(["b", "c"])
  const pool = [item("h")]
  expect(
    featuredItems(products(2), [], "available", pool).map((entry) => entry.id),
  ).toEqual(["p0", "p1"])
  expect(
    featuredItems(products(2), ["h"], "available", pool).map(
      (entry) => entry.id,
    ),
  ).toEqual(["h", "p0", "p1"])
})

test("Shop search applies and clears on /shop, keeping clean listing URLs", () => {
  expect(catalogListingPathHref("/", "cat-a")).toBe("/?category=cat-a")
  expect(catalogListingPathHref("/shop")).toBe("/shop")
  expect(catalogListingPathHref("/shop", "cat-a", null, { q: "basket" })).toBe(
    "/shop?category=cat-a&q=basket",
  )
  const html = render(
    snapshot(current(), {
      items: products(8),
      offeringCounts: { products: 8, services: 0 },
      categories: [
        { id: "cat-a", name: "Baskets" },
        { id: "cat-b", name: "Mats" },
      ],
      category: "cat-a",
      query: { q: "basket" },
      nextCursor: "p7",
    }),
    "shop",
  )
  expect(html.match(/<form[^>]*>/)?.[0]).toContain('action="/shop"')
  expect(html).toMatch(/href="\/shop"[^>]*>Clear filters/)
  expect(html).toContain('href="/shop?category=cat-b&amp;q=basket"')
  expect(html).toContain(
    'href="/shop?category=cat-a&amp;q=basket&amp;after=p7"',
  )
  expect(html).not.toContain('href="/shop/?')
})

test("footer links to Your orders exactly when customer accounts are offered", () => {
  const composition = current()
  const footer = (html: string) =>
    html.slice(html.indexOf('<footer class="cs-footer"'))
  expect(
    footer(render(snapshot(composition, {}, { commerce: accountsOn }))),
  ).toContain('href="/account">Your orders</a>')
  expect(footer(render(snapshot(composition)))).not.toContain("Your orders")
  section(composition, "header").settings["show-login"] = false
  expect(
    footer(render(snapshot(composition, {}, { commerce: accountsOn }))),
  ).not.toContain("Your orders")
})

test("guest recovery asks for the reference and WhatsApp proof, never a lookup by number", () => {
  const account = (view: AccountView) =>
    render(snapshot(current(), {}, { commerce: accountsOn }), "home", {
      kind: "account",
      account: view,
    })
  const signedOut = {
    signedIn: false as const,
    channels: ["email", "whatsapp"] as const,
    next: null,
    testAdapter: false,
  }
  let html = account({ ...signedOut, find: "R-7KQ2MX" })
  expect(html).toContain("Find your request")
  expect(html).toContain('value="R-7KQ2MX"')
  expect(html).toContain("WhatsApp number")
  expect(html).toContain("Log in instead")
  html = account(signedOut)
  expect(html).toContain("Ordered as a guest? Find a request")
  // Without WhatsApp codes there is no way to prove a guest request.
  html = account({ ...signedOut, channels: ["email"] })
  expect(html).not.toContain("Find a request")
  const signedIn = {
    signedIn: true as const,
    label: "+234 ••• 567",
    channel: "whatsapp" as const,
    history: [],
    linkable: [],
  }
  html = account({
    ...signedIn,
    lookup: { reference: "R-7KQ2MX", href: "/receipt/token" },
  })
  expect(html).toMatch(/href="\/receipt\/token"[^>]*>Open request/)
  html = account({
    ...signedIn,
    lookup: { reference: "R-7KQ2MX", href: null },
  })
  expect(html).toContain("We couldn&#x27;t find R-7KQ2MX")
  expect(html).not.toContain("/receipt/")
  html = account({
    ...signedIn,
    channel: "email",
    label: "m•••@test.test",
    lookup: { reference: "R-7KQ2MX", href: null },
  })
  expect(html).toContain("Find R-7KQ2MX with WhatsApp")
  expect(html).not.toContain("Find a request by its reference")
})
