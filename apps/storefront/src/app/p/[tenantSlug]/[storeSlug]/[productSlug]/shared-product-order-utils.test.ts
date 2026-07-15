import { describe, expect, test } from "bun:test"
import {
  getCustomerAuthMode,
  getErrorMessage,
  getFormValue,
  getOrderQuantity,
  getSharedPath,
  getSharedProductPreviewImageUrl,
  getStorefrontBaseUrl,
  getStorefrontBaseUrlFromHeaders,
} from "./shared-product-order-utils"

describe("shared product order utilities", () => {
  test("builds an encoded shared product path without exposing raw ids", () => {
    expect(
      getSharedPath(
        {
          productSlug: "rice bag",
          storeSlug: "main/branch",
          tenantSlug: "ewa trade",
        },
        "token+with spaces",
      ),
    ).toBe(
      "/p/ewa%20trade/main%2Fbranch/rice%20bag?share=token%2Bwith%20spaces",
    )
  })

  test("normalizes storefront base urls from configured env values", () => {
    const previousEwatradeUrl = process.env.STOREFRONT_URL
    const previousUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL
    const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
    process.env.STOREFRONT_URL = undefined
    process.env.NEXT_PUBLIC_STOREFRONT_URL = "https://shop.example.com///"
    process.env.NEXT_PUBLIC_APP_URL = undefined

    expect(getStorefrontBaseUrl()).toBe("https://shop.example.com")

    process.env.STOREFRONT_URL = previousEwatradeUrl
    process.env.NEXT_PUBLIC_STOREFRONT_URL = previousUrl
    process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
  })

  test("uses forwarded storefront host for share-link metadata urls", () => {
    const headers = new Headers({
      host: "internal-storefront.example.com",
      "x-forwarded-host": "rice-store.ewatrade.com",
      "x-forwarded-proto": "https",
    })

    expect(getStorefrontBaseUrlFromHeaders(headers)).toBe(
      "https://rice-store.ewatrade.com",
    )
  })

  test("uses request host and localhost protocol when forwarded host is absent", () => {
    expect(
      getStorefrontBaseUrlFromHeaders(
        new Headers({
          host: "localhost:3091",
        }),
      ),
    ).toBe("http://localhost:3091")
  })

  test("falls back to configured storefront url for malformed request host", () => {
    const previousEwatradeUrl = process.env.STOREFRONT_URL
    const previousUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL
    const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
    process.env.STOREFRONT_URL = undefined
    process.env.NEXT_PUBLIC_STOREFRONT_URL = "https://shop.example.com"
    process.env.NEXT_PUBLIC_APP_URL = undefined

    expect(
      getStorefrontBaseUrlFromHeaders(
        new Headers({
          host: "not a host",
        }),
      ),
    ).toBe("https://shop.example.com")

    process.env.STOREFRONT_URL = previousEwatradeUrl
    process.env.NEXT_PUBLIC_STOREFRONT_URL = previousUrl
    process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
  })

  test("uses a public product image before the generated preview card", () => {
    expect(
      getSharedProductPreviewImageUrl({
        fallbackImageUrl:
          "https://rice-store.ewatrade.com/api/og/shared-product",
        productImageUrl: "https://cdn.example.com/products/rice.png",
      }),
    ).toBe("https://cdn.example.com/products/rice.png")
  })

  test("falls back to generated preview image for unsafe product image urls", () => {
    const fallbackImageUrl =
      "https://rice-store.ewatrade.com/api/og/shared-product"

    expect(
      getSharedProductPreviewImageUrl({
        fallbackImageUrl,
        productImageUrl: "/products/rice.png",
      }),
    ).toBe(fallbackImageUrl)
    expect(
      getSharedProductPreviewImageUrl({
        fallbackImageUrl,
        productImageUrl: "http://localhost:3000/products/rice.png",
      }),
    ).toBe(fallbackImageUrl)
    expect(
      getSharedProductPreviewImageUrl({
        fallbackImageUrl,
        productImageUrl: "javascript:alert(1)",
      }),
    ).toBe(fallbackImageUrl)
  })

  test("defaults customer auth mode to registration unless login is explicit", () => {
    expect(getCustomerAuthMode("login")).toBe("login")
    expect(getCustomerAuthMode("register")).toBe("register")
    expect(getCustomerAuthMode("")).toBe("register")
    expect(getCustomerAuthMode("password")).toBe("register")
  })

  test("coerces submitted order quantities to positive whole numbers", () => {
    expect(getOrderQuantity("2.9")).toBe(2)
    expect(getOrderQuantity("0")).toBe(1)
    expect(getOrderQuantity("-5")).toBe(1)
    expect(getOrderQuantity("not-a-number")).toBe(1)
  })

  test("reads only string form values", () => {
    const formData = new FormData()
    formData.set("customerEmail", " buyer@example.com ")
    formData.set("receipt", new Blob(["ignored"]))

    expect(getFormValue(formData, "customerEmail")).toBe(" buyer@example.com ")
    expect(getFormValue(formData, "receipt")).toBe("")
    expect(getFormValue(formData, "missing")).toBe("")
  })

  test("maps shared-link customer and stock errors to prompt-style copy", () => {
    expect(getErrorMessage("CUSTOMER_NAME_REQUIRED")).toBe(
      "Enter your name to create your customer account.",
    )
    expect(getErrorMessage("CUSTOMER_PASSWORD_REQUIRED")).toBe(
      "Enter a password with at least 8 characters.",
    )
    expect(getErrorMessage("CUSTOMER_LOGIN_FAILED")).toBe(
      "We could not log you in with that email and password.",
    )
    expect(getErrorMessage("INSUFFICIENT_STOCK")).toBe(
      "That quantity is no longer available. Please choose a smaller quantity.",
    )
    expect(getErrorMessage("UNEXPECTED")).toBe(
      "We could not submit the request. Please review the form and try again.",
    )
    expect(getErrorMessage()).toBeNull()
  })
})
