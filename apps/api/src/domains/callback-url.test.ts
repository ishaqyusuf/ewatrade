import { describe, expect, test } from "bun:test"

import { buildDomainCheckoutCallbackUrl } from "./callback-url"

describe("domain checkout callback URLs", () => {
  test("restores dashboard registration progress after Paystack", () => {
    expect(
      buildDomainCheckoutCallbackUrl({
        baseUrl: "https://app.ewatrade.com/settings/domains",
        domainOrderId: "order_1",
        surface: "dashboard",
      }),
    ).toBe(
      "https://app.ewatrade.com/settings/domains?domainOrderId=order_1&domainMode=progress",
    )
  })

  test("restores mobile registration progress through the deep link", () => {
    expect(
      buildDomainCheckoutCallbackUrl({
        baseUrl: "ewatrade://domain-management-modal",
        domainOrderId: "order_1",
        surface: "mobile",
      }),
    ).toBe("ewatrade://domain-management-modal?domainOrderId=order_1")
  })
})
