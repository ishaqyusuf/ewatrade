import type { DomainMoney } from "./types"

export type DomainPricingConfig = {
  exchangeRate?: number
  fixedFeeMinor: number
  markupBasisPoints: number
  retailCurrencyCode: string
}

export type DomainRetailPrice = {
  exchangeRate: string | null
  providerCost: DomainMoney
  retailPrice: DomainMoney
}

function requireSafeMoney(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer in minor units.`)
  }
}

export function calculateDomainRetailPrice(
  providerCost: DomainMoney,
  config: DomainPricingConfig,
): DomainRetailPrice {
  requireSafeMoney(providerCost.amountMinor, "Provider cost")
  requireSafeMoney(config.fixedFeeMinor, "Fixed fee")

  if (
    !Number.isInteger(config.markupBasisPoints) ||
    config.markupBasisPoints < 0
  ) {
    throw new Error("Markup must be a non-negative integer in basis points.")
  }

  const sameCurrency =
    providerCost.currencyCode.toUpperCase() ===
    config.retailCurrencyCode.toUpperCase()
  const exchangeRate = sameCurrency ? 1 : config.exchangeRate

  if (!exchangeRate || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error(
      `An exchange rate is required to convert ${providerCost.currencyCode} to ${config.retailCurrencyCode}.`,
    )
  }

  const convertedMinor = Math.ceil(providerCost.amountMinor * exchangeRate)
  const percentageFee = Math.ceil(
    (convertedMinor * config.markupBasisPoints) / 10_000,
  )
  const amountMinor = convertedMinor + percentageFee + config.fixedFeeMinor
  requireSafeMoney(amountMinor, "Retail price")

  return {
    exchangeRate: sameCurrency ? null : exchangeRate.toString(),
    providerCost: {
      amountMinor: providerCost.amountMinor,
      currencyCode: providerCost.currencyCode.toUpperCase(),
    },
    retailPrice: {
      amountMinor,
      currencyCode: config.retailCurrencyCode.toUpperCase(),
    },
  }
}

export function getDomainPricingConfig(
  providerCurrencyCode = "USD",
  env: Record<string, string | undefined> = process.env,
): DomainPricingConfig {
  const markupBasisPoints = Number(env.DOMAIN_PRICE_MARKUP_BPS ?? "2000")
  const fixedFeeMinor = Number(env.DOMAIN_FIXED_FEE_MINOR ?? "100000")
  const normalizedProviderCurrency = providerCurrencyCode.trim().toUpperCase()
  const exchangeRateKey = `DOMAIN_${normalizedProviderCurrency}_NGN_RATE`
  const configuredRate = env[exchangeRateKey]
  const exchangeRate = configuredRate ? Number(configuredRate) : undefined

  return {
    exchangeRate,
    fixedFeeMinor,
    markupBasisPoints,
    retailCurrencyCode: "NGN",
  }
}
