import type { PricingPhaseAndroid, SubscriptionOffer } from "expo-iap"

function period(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`
}

export function iosSubscriptionPrice(price: string, count: string | null | undefined, unit: string | null | undefined) {
  const value = Number(count)
  if (!price.trim() || !Number.isSafeInteger(value) || value < 1 || !unit || !["day", "week", "month", "year"].includes(unit)) return null
  return `${price} every ${period(value, unit)}`
}

export function playBillingPeriod(value: string) {
  const match = /^P([1-9]\d*)([DWMY])$/.exec(value)
  if (!match) return null
  const count = Number(match[1])
  if (!Number.isSafeInteger(count)) return null
  const unit = { D: "day", W: "week", M: "month", Y: "year" }[match[2]!]
  return unit ? period(count, unit) : null
}

function phaseDescription(phase: PricingPhaseAndroid, last: boolean) {
  const duration = playBillingPeriod(phase.billingPeriod)
  if (!duration || !phase.formattedPrice.trim()) return null
  if (last) return phase.recurrenceMode === 1 ? `${phase.formattedPrice} every ${duration}` : null
  if (phase.recurrenceMode !== 2 || !Number.isSafeInteger(phase.billingCycleCount) || phase.billingCycleCount < 1) return null
  return `${phase.formattedPrice} every ${duration} for ${phase.billingCycleCount} billing ${phase.billingCycleCount === 1 ? "period" : "periods"}`
}

// The displayed offer and purchased token must always come from the same entry.
export function playSubscriptionOffer(offers: Pick<SubscriptionOffer, "offerTokenAndroid" | "pricingPhasesAndroid">[] | null | undefined) {
  const eligible = offers?.filter((offer) => offer.offerTokenAndroid) ?? []
  if (eligible.length !== 1) return null
  const offer = eligible[0]!
  const phases = offer.pricingPhasesAndroid?.pricingPhaseList ?? []
  if (!phases.length) return null
  const descriptions = phases.map((phase, index) => phaseDescription(phase, index === phases.length - 1))
  if (descriptions.some((description) => description === null)) return null
  return { token: offer.offerTokenAndroid!, label: descriptions.join(", then ") }
}
