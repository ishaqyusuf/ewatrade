import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { validateComposition } from "../../../storefront-contracts/src/manifest"
import {
  orderingFulfilmentMethods,
  storefrontOrderRequestSchema,
} from "../../../storefront-contracts/src/orders"
import type {
  PublicCatalogItem,
  StorefrontResources,
} from "../../../storefront-contracts/src/resources"
import {
  buildSectionLibrary,
  canvasDefaults,
  insertSectionExcerpt,
} from "../canvas/library"
import { fixture } from "../fixtures"
import {
  availableDraftUpgrade,
  draftUpgrades,
  getTemplateManifest,
  listSelectableTemplates,
  migrateCommerceStudioFeaturedDraft,
  pinnedCatalogItemIds,
  replaceDraftTemplate,
  templateRegistry,
  themeForTemplate,
  upgradeDraftVersion,
} from "../registry"
import { StorefrontTemplate } from "../render"
import {
  addBagLine,
  addQuantity,
  bagTotals,
  lineTotalMinor,
  quantityProblem,
  readBag,
  readableOn,
  stepQuantity,
  stockWording,
  storefrontMode,
  writeBag,
} from "./commerce"
import { commerceStudioManifest } from "./manifest"
import { featuredItems } from "./render"

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
  options: [
    {
      id: `${id}-o`,
      name: "Default",
      priceMinor: 250000,
      currencyCode: "NGN",
      availability: null,
      ...(kind === "PRODUCT"
        ? { stock: "in_stock" as const, unit: { label: "piece", scale: 0 } }
        : {}),
    },
  ],
  ...extra,
})

function snapshot(
  catalog: Partial<StorefrontResources["catalog"]>,
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
    composition: canvasDefaults(commerceStudioManifest),
    mode: "live" as const,
    locale: "en-NG",
    currencyCode: "NGN",
  }
}
const render = (value: ReturnType<typeof snapshot>, pageKey = "home") =>
  renderToStaticMarkup(
    <StorefrontTemplate
      snapshot={value}
      domain="shop.test"
      customerChatOrigin="https://chat.test"
      pageKey={pageKey}
    />,
  )

test("registered as a qualified, selectable exact pin with its own sections and theme controls", () => {
  const entry = templateRegistry.find(
    (e) => e.manifest.key === "commerce-studio",
  )
  expect(entry?.status).toEqual({
    registration: "runtime-registered",
    qualification: "qualified",
    release: "not-live",
  })
  expect(
    listSelectableTemplates().some((e) => e.manifest.key === "commerce-studio"),
  ).toBe(true)
  expect(commerceStudioManifest.sections.length).toBeLessThanOrEqual(32)
  expect(commerceStudioManifest.themeControls).toEqual(["width", "density"])
  const composition = canvasDefaults(commerceStudioManifest)
  expect(getTemplateManifest(composition, "new-use").key).toBe(
    "commerce-studio",
  )
  // Header and footer are fixed; width/density only valid where declared.
  const moved = structuredClone(composition)
  moved.pages[0]?.sections.reverse()
  expect(() => validateComposition(moved, commerceStudioManifest)).toThrow()
  const themed = {
    ...composition,
    theme: { ...composition.theme, width: "wide", density: "compact" },
  }
  expect(validateComposition(themed, commerceStudioManifest).theme.width).toBe(
    "wide",
  )
  const marketHall = templateRegistry.find(
    (e) => e.manifest.key === "market-hall",
  )?.manifest
  if (!marketHall) throw new Error("market hall missing")
  expect(() =>
    validateComposition(
      {
        ...canvasDefaults(marketHall),
        theme: { ...composition.theme, width: "wide" },
      },
      marketHall,
    ),
  ).toThrow("no width setting")
})

test("Studio can add and duplicate its sections before the fixed footer", () => {
  const library = buildSectionLibrary([commerceStudioManifest])
  const faq = library.find(
    (entry) => entry.definition.key === "commerce-studio-faq",
  )
  if (!faq) throw new Error("faq excerpt missing")
  const composition = canvasDefaults(commerceStudioManifest)
  const next = insertSectionExcerpt(composition, "shop", faq, "shop-faq-copy")
  const types = next.pages
    .find((p) => p.key === "shop")
    ?.sections.map((s) => s.type)
  expect(types?.at(-1)).toBe("commerce-studio-footer")
  expect(types?.at(-2)).toBe("commerce-studio-faq")
})

test("presentation adapts to products-only, services-only, both and empty businesses", () => {
  const products = render(
    snapshot({
      items: [item("a", "PRODUCT"), item("b", "PRODUCT")],
      offeringCounts: { products: 2, services: 0 },
    }),
  )
  expect(products).toContain(">Shop<")
  expect(products).not.toContain(">Services<")
  const services = render(
    snapshot({
      items: [item("s", "SERVICE")],
      offeringCounts: { products: 0, services: 1 },
    }),
  )
  expect(services).toContain(">Services<")
  expect(services).not.toContain(">Shop<")
  expect(services).toContain("Choose a service")
  const both = render(
    snapshot({
      items: [item("a", "PRODUCT"), item("s", "SERVICE")],
      offeringCounts: { products: 1, services: 1 },
    }),
  )
  expect(both).toContain(">Shop<")
  expect(both).toContain(">Services<")
  const empty = render(
    snapshot({
      items: [],
      categories: [],
      offeringCounts: { products: 0, services: 0 },
    }),
  )
  expect(empty).toContain("Nothing is listed here yet")
  expect(empty).not.toContain("How ordering works")
  expect(empty).not.toContain("Send a request on this site")
})

test("one category hides category controls; several show them; history never decides mode", () => {
  const one = render(
    snapshot({
      items: [item("a", "PRODUCT"), item("b", "PRODUCT")],
      categories: [{ id: "cat-a", name: "Baskets" }],
      offeringCounts: { products: 2, services: 0 },
    }),
  )
  expect(one).not.toContain("Shop by category")
  const many = render(
    snapshot({
      items: [
        item("a", "PRODUCT"),
        item("b", "PRODUCT", { category: { id: "cat-b", name: "Linen" } }),
      ],
      categories: [
        { id: "cat-a", name: "Baskets" },
        { id: "cat-b", name: "Linen" },
      ],
      offeringCounts: { products: 2, services: 0 },
    }),
  )
  expect(many).toContain("Shop by category")
  expect(many).toContain("Linen")
})

test("stock wording never presents unknown stock as available", () => {
  expect(stockWording("unknown").label).toBe("Shop confirms stock")
  expect(stockWording(undefined).tone).toBe("unknown")
  expect(stockWording("low_stock").label).toBe("Low stock")
  expect(stockWording("out_of_stock").label).toBe("Sold out")
  const html = render(
    snapshot({
      items: [
        item("u", "PRODUCT", {
          options: [
            {
              id: "u-o",
              name: "Default",
              priceMinor: 100,
              currencyCode: "NGN",
              availability: null,
              stock: "unknown",
            },
          ],
        }),
      ],
      offeringCounts: { products: 1, services: 0 },
    }),
  )
  expect(html).toContain("Shop confirms stock")
  expect(html).not.toContain("In stock")
})

test("quantities respect unit scale, bounds and exact totals", () => {
  expect(quantityProblem("2", 0)).toBeNull()
  expect(quantityProblem("1.5", 0)).toContain("whole numbers")
  expect(quantityProblem("1.25", 1)).toContain("1 decimal place")
  expect(quantityProblem("0", 0)).toContain("more than zero")
  expect(quantityProblem("-1", 0)).toBeTruthy()
  expect(quantityProblem("10000", 0)).toBeTruthy()
  expect(stepQuantity("1", -1, 0)).toBe("1")
  expect(stepQuantity("2.5", 1, 1)).toBe("3.5")
  expect(addQuantity("9998", "5", 0)).toBe("9999")
  expect(lineTotalMinor(120000, "2.5")).toBe(300000)
  expect(lineTotalMinor(333, "0.5")).toBeNull()
  expect(lineTotalMinor(null, "1")).toBeNull()
})

test("bag storage is business-scoped, validated and survives blocked or corrupt storage", () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  const line = {
    itemId: "i1",
    offeringId: "o1",
    quantity: "1",
    priceMinor: 500,
    currencyCode: "NGN",
    itemName: "Basket",
    optionName: "",
    unitLabel: "basket",
    scale: 0,
    photoUrl: null,
    illustrationId: "default",
  }
  expect(writeBag(storage, "shop-a", addBagLine([], line))).toBe("storage")
  expect(readBag(storage, "shop-a").lines).toHaveLength(1)
  expect(readBag(storage, "shop-b").lines).toHaveLength(0)
  const merged = addBagLine(readBag(storage, "shop-a").lines, {
    ...line,
    quantity: "2",
  })
  expect(merged[0]?.quantity).toBe("3")
  expect(bagTotals(merged)).toEqual({
    subtotal: 1500,
    complete: true,
    count: 1,
  })
  store.set("ewatrade.storefront.bag.v1:shop-a", "{not json")
  expect(readBag(storage, "shop-a")).toMatchObject({
    lines: [],
    recovered: true,
  })
  store.set(
    "ewatrade.storefront.bag.v1:shop-a",
    JSON.stringify({ version: 1, lines: [{ ...line, customerPhone: "+234" }] }),
  )
  expect(readBag(storage, "shop-a")).toMatchObject({
    lines: [],
    recovered: true,
  })
  const throwing = {
    getItem: () => {
      throw new Error("blocked")
    },
    setItem: () => {
      throw new Error("blocked")
    },
    removeItem: () => {},
  }
  expect(readBag(throwing, "shop-a").persistence).toBe("memory")
  expect(writeBag(throwing, "shop-a", [line])).toBe("memory")
  expect(readBag(null, "shop-a").persistence).toBe("memory")
  const many = Array.from({ length: 20 }, (_, i) => ({
    ...line,
    offeringId: `o${i}`,
  }))
  expect(() => addBagLine(many, { ...line, offeringId: "o99" })).toThrow()
})

test("order request contract: guest name + WhatsApp, address only for delivery, no duplicate options", () => {
  const base = {
    clientRequestId: "6a1f4d1e-8b38-4b8a-9d1e-7f0a3c2b1a00",
    lines: [
      {
        itemId: "i",
        offeringId: "o",
        quantity: "1",
        observedUnitPriceMinor: 100,
      },
    ],
    customerName: "Ada",
    customerPhone: "08031234567",
    fulfilment: "pickup",
  }
  expect(storefrontOrderRequestSchema.safeParse(base).success).toBe(true)
  expect(
    storefrontOrderRequestSchema.safeParse({ ...base, fulfilment: "delivery" })
      .success,
  ).toBe(false)
  expect(
    storefrontOrderRequestSchema.safeParse({
      ...base,
      fulfilment: "delivery",
      deliveryAddress: "12 Allen Avenue",
    }).success,
  ).toBe(true)
  expect(
    storefrontOrderRequestSchema.safeParse({ ...base, lines: [] }).success,
  ).toBe(false)
  expect(
    storefrontOrderRequestSchema.safeParse({
      ...base,
      lines: [...base.lines, ...base.lines],
    }).success,
  ).toBe(false)
  expect(
    storefrontOrderRequestSchema.safeParse({
      ...base,
      notes: "<script>x</script>",
    }).success,
  ).toBe(false)
  expect(
    storefrontOrderRequestSchema.safeParse({ ...base, extra: true }).success,
  ).toBe(false)
  const header = (settings: Record<string, unknown>) => ({
    pages: [{ sections: [{ type: "commerce-studio-header", settings }] }],
  })
  expect(orderingFulfilmentMethods(header({}))).toEqual(["pickup"])
  expect(orderingFulfilmentMethods(header({ "offer-delivery": true }))).toEqual(
    ["pickup", "delivery"],
  )
  expect(
    orderingFulfilmentMethods(
      header({ "offer-pickup": false, "offer-delivery": true }),
    ),
  ).toEqual(["delivery"])
  expect(orderingFulfilmentMethods(header({ "offer-pickup": false }))).toEqual([
    "pickup",
  ])
})

test("merchant settings render; copy stays plain text; storefront mode counts public offerings", () => {
  const value = snapshot({
    items: [item("a", "PRODUCT")],
    offeringCounts: { products: 1, services: 0 },
  })
  const header = value.composition.pages[0]?.sections[0]
  if (header)
    header.settings = {
      ...header.settings,
      tagline: "Bread & <b>more</b>",
      location: "Ojota",
    }
  const html = render(value)
  expect(html).toContain("Bread &amp; &lt;b&gt;more&lt;/b&gt;")
  expect(html).toContain("Ojota")
  expect(
    storefrontMode({
      items: [item("a", "PRODUCT")],
      offeringCounts: { products: 0, services: 3 },
    }).mode,
  ).toBe("services")
  expect(readableOn("#ffffff")).toBe("#1c211e")
  expect(readableOn("#8b4b35")).toBe("#ffffff")
})

const featuredSection = (composition: ReturnType<typeof canvasDefaults>) => {
  const section = composition.pages[0]?.sections.find(
    (entry) => entry.type === "commerce-studio-featured",
  )
  if (!section) throw new Error("featured missing")
  return section
}
const featuredNames = (html: string) => {
  const start = html.indexOf("New in the shop")
  const end = html.indexOf("</section>", start)
  return [...html.slice(start, end).matchAll(/Item ([a-z]+)</g)]
    .map((match) => match[1])
    .filter((name, index, all) => all.indexOf(name) === index)
}

test("1.1.0 keeps 1.0.0 registered and pins only IDs on Featured", () => {
  const legacy = getTemplateManifest(
    { template: { key: "commerce-studio", version: "1.0.0" } },
    "render",
  )
  expect(commerceStudioManifest.version).toBe("1.1.0")
  const old = canvasDefaults(legacy)
  expect(featuredSection(old).settings.pinned).toBeUndefined()
  // An old release stays valid against its exact pin and refuses the new field.
  expect(validateComposition(old, legacy).template.version).toBe("1.0.0")
  const smuggled = structuredClone(old)
  featuredSection(smuggled).settings.pinned = ["a"]
  expect(() => validateComposition(smuggled, legacy)).toThrow(
    "Unknown editable field pinned",
  )
  const migrated = migrateCommerceStudioFeaturedDraft(old)
  expect(migrated.template.version).toBe("1.1.0")
  expect(featuredSection(migrated)).toMatchObject({
    version: 2,
    settings: { pinned: [], heading: "New in the shop" },
  })
  expect(() => migrateCommerceStudioFeaturedDraft(migrated)).toThrow()
  // Old-version drafts still render through their exact pin.
  const html = render({
    ...snapshot({ items: [item("a", "PRODUCT"), item("b", "PRODUCT")] }),
    composition: old,
  })
  expect(featuredNames(html)).toEqual(["a", "b"])
  // Library lists one Featured (current), and inserts follow the draft's exact pin.
  const library = buildSectionLibrary(
    listSelectableTemplates().map((entry) => entry.manifest),
  )
  const featured = library.filter(
    (entry) => entry.definition.key === "commerce-studio-featured",
  )
  expect(featured.map((entry) => entry.definition.version)).toEqual([2])
  const [current] = featured
  if (!current) throw new Error("featured excerpt missing")
  const inserted = insertSectionExcerpt(old, "shop", current, "shop-featured")
  expect(
    inserted.pages
      .find((page) => page.key === "shop")
      ?.sections.find((entry) => entry.id === "shop-featured")?.version,
  ).toBe(1)
})

test("Featured shows pins first in order, skips non-public pins, then fills automatically", () => {
  const composition = canvasDefaults(commerceStudioManifest)
  featuredSection(composition).settings.pinned = ["d", "hidden", "s", "b"]
  featuredSection(composition).settings.count = "three"
  const value = {
    ...snapshot({
      items: [
        item("a", "PRODUCT"),
        item("b", "PRODUCT"),
        item("c", "PRODUCT"),
        item("d", "PRODUCT"),
        item("s", "SERVICE"),
      ],
    }),
    composition: validateComposition(composition, commerceStudioManifest),
  }
  // "hidden" (archived, off-Store or over the plan cap) is absent from the public
  // load and the service isn't a product; both are skipped without an error.
  const html = render(value)
  expect(featuredNames(html)).toEqual(["d", "b", "a"])
  expect(html).not.toContain("?item=hidden")
  expect(
    featuredItems(value.resources.catalog.items, ["c"], "price-low").map(
      (entry) => entry.id,
    ),
  ).toEqual(["c", "a", "b", "d"])
  expect(
    featuredItems(value.resources.catalog.items, null, "available").map(
      (entry) => entry.id,
    ),
  ).toEqual(["a", "b", "c", "d"])
})

test("Studio version update is explicit, generic and draft-only; pinned IDs come only from catalog-items fields", () => {
  const legacy = getTemplateManifest(
    { template: { key: "commerce-studio", version: "1.0.0" } },
    "render",
  )
  const old = canvasDefaults(legacy)
  featuredSection(old).settings.heading = "Merchant copy"
  const before = JSON.stringify(old)
  expect(availableDraftUpgrade(old)).toEqual({
    version: "1.1.0",
    summary: "Adds pinned featured products.",
  })
  const next = upgradeDraftVersion(old)
  expect(JSON.stringify(old)).toBe(before)
  expect(next.template.version).toBe("1.1.0")
  expect(featuredSection(next).settings).toMatchObject({
    heading: "Merchant copy",
    pinned: [],
  })
  expect(availableDraftUpgrade(next)).toBeNull()
  expect(() => upgradeDraftVersion(next)).toThrow()
  // Every registered migration starts from a registered pin and lands on a selectable one.
  for (const upgrade of draftUpgrades) {
    expect(
      getTemplateManifest({ template: upgrade.from }, "render").version,
    ).toBe(upgrade.from.version)
    expect(
      getTemplateManifest(
        { template: { key: upgrade.from.key, version: upgrade.to } },
        "new-use",
      ).version,
    ).toBe(upgrade.to)
  }
  // One selectable entry per key leads with the newest version (dialog shows one card).
  const keys = listSelectableTemplates().map((entry) => entry.manifest.key)
  expect(keys.indexOf("commerce-studio")).toBe(
    listSelectableTemplates().findIndex(
      (entry) =>
        entry.manifest.key === "commerce-studio" &&
        entry.manifest.version === "1.1.0",
    ),
  )
  featuredSection(next).settings.pinned = ["b", "a"]
  const shop = next.pages.find((page) => page.key === "shop")
  shop?.sections.splice(1, 0, {
    ...structuredClone(featuredSection(next)),
    id: "shop-featured",
    settings: { ...featuredSection(next).settings, pinned: ["a", "c"] },
  })
  expect(pinnedCatalogItemIds(next)).toEqual(["b", "a", "c"])
  const hidden = structuredClone(next)
  featuredSection(hidden).visible = false
  expect(pinnedCatalogItemIds(hidden)).toEqual(["a", "c"])
  expect(pinnedCatalogItemIds(old)).toEqual([])
})

test("replacing a width/density draft keeps only theme controls the target declares", () => {
  const composition = canvasDefaults(commerceStudioManifest)
  composition.theme = {
    ...composition.theme,
    accent: "#8b4b35",
    width: "wide",
    density: "compact",
  }
  const marketHall = listSelectableTemplates().find(
    (entry) => entry.manifest.key === "market-hall",
  )?.manifest
  if (!marketHall) throw new Error("market hall missing")
  const replaced = replaceDraftTemplate(composition, marketHall)
  expect(replaced.theme).toEqual({
    font: "system",
    accent: "#8b4b35",
    background: "#ffffff",
    radius: "small",
  })
  expect(themeForTemplate(composition.theme, commerceStudioManifest)).toEqual(
    composition.theme,
  )
})
