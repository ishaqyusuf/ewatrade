import { findCountry } from "@ewatrade/utils/countries"

export type WebPlanId = "starter" | "growth" | "pro"
// ISO alpha-2 countries/areas in UN M49 Africa.
const africa = new Set(
  "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH IO TF YT RE SH".split(
    " ",
  ),
)

export const WEB_MONTHLY_BASE_PRICE_MINOR = {
  starter: 500_000,
  growth: 1_500_000,
  pro: 3_000_000,
} as const

/** Approved NGN reference, not a foreign exchange quote or a customer charge. */
export function webMonthlyPriceReference(
  planId: WebPlanId,
  country: string | null,
) {
  if (!country || !/^[A-Z]{2}$/.test(country) || !findCountry(country))
    return null
  const base = WEB_MONTHLY_BASE_PRICE_MINOR[planId]
  const isAfrica = africa.has(country)
  return {
    region: isAfrica ? ("africa" as const) : ("international" as const),
    currency: "NGN" as const,
    amountMinor: isAfrica ? base : (base * 120) / 100,
  }
}
