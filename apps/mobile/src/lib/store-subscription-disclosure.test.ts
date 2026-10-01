import { describe, expect, test } from "bun:test"
import { iosSubscriptionPrice, playBillingPeriod, playSubscriptionOffer } from "./store-subscription-disclosure"

const recurring = { billingCycleCount: 0, billingPeriod: "P1M", formattedPrice: "₦5,000", priceAmountMicros: "5000000000", priceCurrencyCode: "NGN", recurrenceMode: 1 }
const offer = { offerTokenAndroid: "store-offer", pricingPhasesAndroid: { pricingPhaseList: [recurring] } }

describe("store subscription disclosure", () => {
  test("formats actual store billing durations", () => {
    expect(iosSubscriptionPrice("₦5,000", "1", "month")).toBe("₦5,000 every 1 month")
    expect(playBillingPeriod("P3M")).toBe("3 months")
    expect(playBillingPeriod("P1Y")).toBe("1 year")
  })
  test("rejects missing and unsupported periods instead of selling with unknown terms", () => {
    for (const count of [null, "", "0", "1.5", "NaN"]) expect(iosSubscriptionPrice("$5", count, "month")).toBeNull()
    expect(iosSubscriptionPrice("$5", "1", "empty")).toBeNull()
    expect(playBillingPeriod("P1M2D")).toBeNull()
    expect(playBillingPeriod("P0D")).toBeNull()
  })
  test("keeps disclosed price and purchase offer token together", () => {
    expect(playSubscriptionOffer([offer])).toEqual({token: "store-offer", label: "₦5,000 every 1 month"})
    expect(playSubscriptionOffer([offer, { ...offer, offerTokenAndroid: "another" }])).toBeNull()
    expect(playSubscriptionOffer([])).toBeNull()
  })
  test("discloses finite introductory phases and ongoing renewal", () => {
    const introductory = {...recurring, formattedPrice: "₦0", billingPeriod: "P1W", billingCycleCount: 2, recurrenceMode: 2}
    expect(playSubscriptionOffer([{...offer, pricingPhasesAndroid: {pricingPhaseList: [introductory, recurring]}}])?.label).toBe("₦0 every 1 week for 2 billing periods, then ₦5,000 every 1 month")
    expect(playSubscriptionOffer([{...offer, pricingPhasesAndroid: {pricingPhaseList: [introductory]}}])).toBeNull()
    expect(playSubscriptionOffer([{...offer, pricingPhasesAndroid: {pricingPhaseList: [{...introductory, billingCycleCount: 0}, recurring]}}])).toBeNull()
  })
})
