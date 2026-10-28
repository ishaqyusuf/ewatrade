import { expect, test } from "bun:test"
import type { StorefrontCommerceAdapter } from "@ewatrade/storefront-contracts/commerce"
import { renderToStaticMarkup } from "react-dom/server"
import { storefrontFeatureTokens } from "../feature-theme"
import type { StorefrontClientSnapshot } from "../server"
import { previewCommerceAdapter } from "./preview"
import { StorefrontCommerceProvider, useStorefrontCommerce } from "./provider"

// The module interface accepts a public snapshot and trusted presentation, without a template.
const snapshot: StorefrontClientSnapshot = {
  mode: "live",
  locale: "en-NG",
  currencyCode: "NGN",
  composition: {
    schemaVersion: 1,
    template: { key: "independent", version: "1.0.0" },
    theme: {
      font: "system",
      accent: "#171717",
      background: "#ffffff",
      radius: "small",
    },
    pages: [{ key: "home", sections: [] }],
  },
  resources: {
    business: { slug: "business-a", name: "Business A", description: null },
    catalog: {
      items: [],
      highlightedItem: null,
      categories: [],
      category: null,
      nextCursor: null,
      hasHiddenItems: false,
      offeringCounts: { products: 0, services: 0 },
    },
    contact: { chatToken: null, whatsAppPhone: null },
    commerce: {
      customerAccounts: { available: true, channels: ["email"] },
      orderRequests: { available: false },
      fulfilment: ["pickup"],
      hasContact: false,
    },
    assets: {},
  },
  capabilities: {
    catalog: { available: false },
    services: { available: false },
    conversation: { available: false },
    whatsappEnquiry: { available: false },
    serviceRequest: { available: false },
  },
}

const presentation = {
  details: {
    tagline: "",
    location: "",
    hours: "",
    offerPickup: true,
    offerDelivery: false,
    deliveryNote: "",
    showLogin: true,
  },
  style: storefrontFeatureTokens(snapshot.composition.theme),
}

test("preview forces the inert adapter even when a live adapter is supplied", async () => {
  let adapter: StorefrontCommerceAdapter | undefined
  const live = { ...previewCommerceAdapter, mode: "live" as const }
  function Probe() {
    adapter = useStorefrontCommerce().adapter
    return null
  }
  renderToStaticMarkup(
    <StorefrontCommerceProvider
      snapshot={snapshot}
      presentation={presentation}
      adapter={live}
      preview
    >
      <Probe />
    </StorefrontCommerceProvider>,
  )
  expect(adapter).toBe(previewCommerceAdapter)
  expect(await adapter?.submitOrder({})).toEqual({
    ok: false,
    message: "This is a preview. Nothing is sent or saved.",
  })
})

test("the live host supplies behavior independently of template identity", () => {
  const live = { ...previewCommerceAdapter, mode: "live" as const }
  function Probe() {
    const state = useStorefrontCommerce()
    expect(state.adapter).toBe(live)
    expect(state.header).toBe(presentation.details)
    expect(state.themeStyle).toBe(presentation.style)
    expect(state.accounts).toBe(true)
    expect(state.ordering).toBe(false)
    return <span>{state.snapshot.resources.business.name}</span>
  }
  expect(
    renderToStaticMarkup(
      <StorefrontCommerceProvider
        snapshot={snapshot}
        presentation={presentation}
        adapter={live}
        preview={false}
      >
        <Probe />
      </StorefrontCommerceProvider>,
    ),
  ).toBe("<span>Business A</span>")
})
