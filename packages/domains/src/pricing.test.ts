import { describe, expect, test } from "bun:test"

import { calculateDomainRetailPrice, getDomainPricingConfig } from "./pricing"

describe("domain retail pricing", () => {
  test("keeps an immutable wholesale and retail calculation", () => {
    expect(
      calculateDomainRetailPrice(
        { amountMinor: 1_000, currencyCode: "USD" },
        {
          exchangeRate: 1_500,
          fixedFeeMinor: 100_000,
          markupBasisPoints: 2_000,
          retailCurrencyCode: "NGN",
        },
      ),
    ).toEqual({
      exchangeRate: "1500",
      providerCost: { amountMinor: 1_000, currencyCode: "USD" },
      retailPrice: { amountMinor: 1_900_000, currencyCode: "NGN" },
    })
  })

  test("does not require an exchange rate for the same currency", () => {
    expect(
      calculateDomainRetailPrice(
        { amountMinor: 10_000, currencyCode: "NGN" },
        {
          fixedFeeMinor: 1_000,
          markupBasisPoints: 1_000,
          retailCurrencyCode: "NGN",
        },
      ).retailPrice.amountMinor,
    ).toBe(12_000)
  })

  test("selects the exchange rate for the provider account currency", () => {
    expect(
      getDomainPricingConfig("EUR", {
        DOMAIN_EUR_NGN_RATE: "1700",
        DOMAIN_FIXED_FEE_MINOR: "100000",
        DOMAIN_PRICE_MARKUP_BPS: "2000",
        DOMAIN_USD_NGN_RATE: "1500",
      }),
    ).toMatchObject({
      exchangeRate: 1700,
      retailCurrencyCode: "NGN",
    })
  })
})
