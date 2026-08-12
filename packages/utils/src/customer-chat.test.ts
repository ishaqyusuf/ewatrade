import { describe, expect, test } from "bun:test"

import {
  buildCustomerChatEntryUrl,
  isCustomerChatRequestHost,
  resolveCustomerChatOrigin,
} from "./customer-chat"

describe("customer chat host contract", () => {
  test("uses the configured shared chat host as the canonical entry origin", () => {
    expect(
      resolveCustomerChatOrigin({
        chatUrl: "https://chat.ewatrade.com/",
        storefrontUrl: "https://store.ewatrade.com",
      }),
    ).toBe("https://chat.ewatrade.com")
  })

  test("derives the shared Portless chat host when configuration is omitted", () => {
    expect(
      resolveCustomerChatOrigin({
        chatUrl: " ",
        storefrontUrl: "https://ewatrade-storefront.localhost/",
      }),
    ).toBe("https://chat.ewatrade-storefront.localhost")
  })

  test("builds an encoded opaque entry path without exposing other scope", () => {
    expect(
      buildCustomerChatEntryUrl({
        origin: "https://chat.ewatrade.com/",
        publicToken: "opaque token/with?reserved=value",
      }),
    ).toBe(
      "https://chat.ewatrade.com/r/opaque%20token%2Fwith%3Freserved%3Dvalue",
    )
  })

  test("rejects an insecure canonical entry origin", () => {
    expect(() =>
      resolveCustomerChatOrigin({
        chatUrl: "http://chat.ewatrade.com",
        storefrontUrl: "https://store.ewatrade.com",
      }),
    ).toThrow("Customer chat origin must be a public HTTPS origin.")
  })

  test("matches only the exact configured chat hostname", () => {
    expect(
      isCustomerChatRequestHost(
        "chat.ewatrade.com:443",
        "https://chat.ewatrade.com",
      ),
    ).toBe(true)
    expect(
      isCustomerChatRequestHost(
        "tenant.ewatrade.com",
        "https://chat.ewatrade.com",
      ),
    ).toBe(false)
    expect(
      isCustomerChatRequestHost(
        "chat.ewatrade-storefront.localhost",
        "https://chat.ewatrade-storefront.localhost",
      ),
    ).toBe(true)
  })
})
