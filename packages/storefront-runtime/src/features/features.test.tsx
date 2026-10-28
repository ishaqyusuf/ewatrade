import { expect, test } from "bun:test"
import type { ReceiptView } from "@ewatrade/storefront-contracts/receipt"
import { renderToStaticMarkup } from "react-dom/server"
import { StorefrontCommerceProvider } from "../commerce/provider"
import { storefrontFeatureTokens } from "../feature-theme"
import { publicStorefrontResources } from "../projection"
import type { StorefrontClientSnapshot } from "../server"
import { StorefrontAccount } from "./account/account"
import { StorefrontCheckout } from "./checkout"
import { StorefrontReceipt } from "./receipt/receipt"

const snapshot: StorefrontClientSnapshot = {
  ...publicStorefrontResources({
    name: "Independent shop",
    slug: "independent",
    description: null,
    currencyCode: "NGN",
    items: [],
    highlightedItem: null,
    categories: [],
    category: null,
    nextCursor: null,
    hasHiddenItems: false,
    chatToken: null,
    whatsAppPhone: null,
  }),
  mode: "live",
  locale: "en-NG",
  currencyCode: "NGN",
  composition: {
    schemaVersion: 1,
    template: { key: "independent", version: "1.0.0" },
    theme: {
      font: "system",
      accent: "#154c3a",
      background: "#ffffff",
      radius: "small",
    },
    pages: [{ key: "home", sections: [] }],
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

test("account and verified history render through the shared interface with injected branding", () => {
  const html = renderToStaticMarkup(
    <StorefrontCommerceProvider
      snapshot={snapshot}
      presentation={presentation}
      preview
    >
      <StorefrontAccount
        account={{
          signedIn: true,
          label: "j…@example.test",
          channel: "email",
          history: [
            {
              key: "a",
              reference: "R-7KQ2MX",
              kind: "order",
              stage: "received",
              createdAt: "2026-10-28T12:00:00Z",
              summary: "Two baskets",
              href: "/receipt/opaque-token",
            },
          ],
          linkable: [],
        }}
      />
    </StorefrontCommerceProvider>,
  )
  expect(html).toContain("sf-feature-root")
  expect(html).toContain("--sf-feature-accent:#154c3a")
  expect(html).toContain("Two baskets")
  expect(html).toContain("/receipt/opaque-token")
  expect(html).not.toContain("commerce-studio")
})

test("a shared request receipt never upgrades a received request to a paid or booked fact", () => {
  const receipt: ReceiptView = {
    token: "opaque-token",
    kind: "order",
    reference: "R-7KQ2MX",
    businessName: "Independent shop",
    stage: "received",
    revision: 1,
    createdAt: "2026-10-28T12:00:00Z",
    customerName: "Jo",
    staffResponse: null,
    messages: [],
    currencyCode: "NGN",
    lines: [
      {
        key: "a",
        name: "Basket",
        option: "",
        quantity: "2",
        unitLabel: "piece",
        unitPriceMinor: 1000,
      },
    ],
    order: null,
    paymentUrl: null,
    businessWhatsApp: null,
    canLinkToAccount: false,
  }
  const html = renderToStaticMarkup(
    <StorefrontCommerceProvider
      snapshot={snapshot}
      presentation={presentation}
      preview
    >
      <StorefrontReceipt receipt={receipt} />
    </StorefrontCommerceProvider>,
  )
  expect(html).toContain("Request received")
  expect(html).toContain("Basket")
  expect(html).not.toContain("See payment details")
  expect(html).not.toContain("The business booked this time")
  expect(html).not.toContain("commerce-studio")
})

test("checkout renders from the neutral host and refuses unavailable intake", () => {
  const html = renderToStaticMarkup(
    <StorefrontCommerceProvider
      snapshot={snapshot}
      presentation={presentation}
      preview
    >
      <StorefrontCheckout />
    </StorefrontCommerceProvider>,
  )
  expect(html).toContain("sf-feature-root")
  expect(html).not.toContain("commerce-studio")
  expect(html).not.toContain("Send request</button>")
})
