import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import {
  EXACT_QUANTITY_MAX_SCALE,
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import type { serviceOfferings } from "./service-jobs-model"

type Offering = ReturnType<typeof serviceOfferings>[number]
type Settings = RouterOutputs["services"]["getSettings"]
type IntakeLine =
  RouterInputs["services"]["createAndConfirmIntake"]["lines"][number]
export type IntakeProjection = {
  lines: IntakeLine[]
  currencyCode: string
  subtotalMinor: number
  serviceChargeMinor: number
  totalMinor: number
  createsTrackedWork: boolean
}

export function projectServiceIntake(
  offerings: readonly Offering[],
  quantities: Readonly<Record<string, string>>,
  express: boolean,
  settings: Settings | undefined,
): { value: IntakeProjection | null; error: string | null } {
  try {
    const entries = Object.entries(quantities)
    if (!entries.length)
      return {
        value: null,
        error: "Select at least one service and enter its quantity.",
      }
    if (entries.length > 100)
      throw new Error("A service intake supports at most 100 offering lines.")
    const byId = new Map(offerings.map((offering) => [offering.id, offering]))
    let subtotal = 0n
    let currencyCode: string | undefined
    let createsTrackedWork = false
    const lines: IntakeLine[] = entries.map(([offeringId, rawQuantity]) => {
      const offering = byId.get(offeringId)
      if (
        !offering ||
        offering.status !== "active" ||
        offering.pricingPolicy !== "fixed" ||
        offering.fixedPriceMinor === null
      )
        throw new Error(
          "A selected service or its fixed price is unavailable. Reload services and select again.",
        )
      if (offering.kind !== "service" || !offering.serviceWorkPolicy)
        throw new Error("Select a configured Service Offering.")
      if (
        !Number.isSafeInteger(offering.fixedPriceMinor) ||
        offering.fixedPriceMinor < 0
      )
        throw new Error("A service price is outside the supported money range.")
      if (currencyCode && currencyCode !== offering.currencyCode)
        throw new Error("Choose services priced in one currency.")
      currencyCode = offering.currencyCode
      if (rawQuantity.length > 40)
        throw new Error("Keep each quantity to 40 characters or fewer.")
      const quantity = parseExactDecimal(rawQuantity.trim(), {
        allowZero: false,
        maxScale: Math.min(
          EXACT_QUANTITY_MAX_SCALE,
          offering.serviceWorkPolicy.quantityScale,
        ),
      })
      const lineTotal = multiplyExactDecimals(
        String(offering.fixedPriceMinor),
        quantity,
      )
      if (!/^\d+$/.test(lineTotal))
        throw new Error(
          "Service line total must be a whole minor currency amount. Change the quantity; it cannot be rounded.",
        )
      subtotal += BigInt(lineTotal)
      createsTrackedWork ||= offering.serviceWorkPolicy.workPolicy === "TRACKED"
      return {
        offeringId,
        quantity,
        expectedFixedPriceMinor: offering.fixedPriceMinor,
      }
    })
    let surcharge = 0n
    if (express) {
      if (!settings?.expressEnabled)
        throw new Error(
          "Load this Store's enabled Express settings before continuing.",
        )
      const rate = settings.expressSurchargeValue
      if (!Number.isSafeInteger(rate) || rate < 0)
        throw new Error("Express pricing is unavailable.")
      surcharge =
        settings.expressSurchargeType === "fixed"
          ? BigInt(rate)
          : (subtotal * BigInt(rate) + 5_000n) / 10_000n
      if (surcharge > 100_000_000n)
        throw new Error("Express surcharge exceeds the supported money range.")
    }
    const total = subtotal + surcharge
    if (total > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error(
        "The service order total exceeds the supported money range.",
      )
    if (!currencyCode) throw new Error("The service currency is unavailable.")
    return {
      value: {
        lines,
        currencyCode,
        subtotalMinor: Number(subtotal),
        serviceChargeMinor: Number(surcharge),
        totalMinor: Number(total),
        createsTrackedWork,
      },
      error: null,
    }
  } catch (failure) {
    return {
      value: null,
      error:
        failure instanceof Error
          ? failure.message
          : "Check the selected services, exact quantities and prices.",
    }
  }
}
