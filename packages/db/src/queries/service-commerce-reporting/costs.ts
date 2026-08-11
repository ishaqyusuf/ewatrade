export const serviceCommerceCostKeys = [
  "metaCostMinor",
  "bspCostMinor",
  "numberCostMinor",
  "paymentProviderFeeMinor",
  "deliveryCostMinor",
  "taxMinor",
  "platformChargeMinor",
  "subscriptionChargeMinor",
  "revenueMinor",
] as const

export type ServiceCommerceCostKey = (typeof serviceCommerceCostKeys)[number]

export type ServiceCommerceCostInput = {
  eventType: string
} & Partial<Record<ServiceCommerceCostKey, number | null>>

export type ServiceCommerceCostSummary = Record<
  ServiceCommerceCostKey,
  { amountMinor: number | null; observedCount: number; unknownCount: number }
>

const costApplicability = {
  bspCostMinor: ["MESSAGE_DELIVERED"],
  deliveryCostMinor: ["DELIVERY_COMPLETED", "DELIVERY_RECONCILED"],
  metaCostMinor: ["MESSAGE_DELIVERED"],
  numberCostMinor: ["NUMBER_FEE_RECONCILED"],
  paymentProviderFeeMinor: ["PAYMENT_SUCCEEDED", "PAYMENT_RECONCILED"],
  platformChargeMinor: [
    "DELIVERY_COMPLETED",
    "DELIVERY_RECONCILED",
    "MESSAGE_SENT",
    "MESSAGE_DELIVERED",
    "MESSAGE_READ",
    "MESSAGE_FAILED",
    "ORDER_CREATED",
    "PAYMENT_SUCCEEDED",
    "PAYMENT_RECONCILED",
    "PICKUP_COMPLETED",
    "QUOTE_ISSUED",
    "REQUEST_RECEIVED",
    "PLATFORM_CHARGE_RECONCILED",
  ],
  revenueMinor: ["ORDER_CREATED", "PAYMENT_SUCCEEDED", "PAYMENT_RECONCILED"],
  subscriptionChargeMinor: ["SUBSCRIPTION_CHARGE_RECONCILED"],
  taxMinor: ["ORDER_CREATED", "TAX_RECONCILED"],
} satisfies Record<ServiceCommerceCostKey, string[]>

export function summarizeServiceCommerceCosts(
  events: ServiceCommerceCostInput[],
): ServiceCommerceCostSummary {
  return Object.fromEntries(
    serviceCommerceCostKeys.map((key) => {
      let amountMinor = 0
      let observedCount = 0
      let unknownCount = 0

      for (const event of events) {
        if (!costApplicability[key].includes(event.eventType)) continue
        const value = event[key]
        if (typeof value === "number" && Number.isSafeInteger(value)) {
          amountMinor += value
          observedCount += 1
        } else {
          unknownCount += 1
        }
      }

      return [
        key,
        {
          amountMinor: observedCount > 0 ? amountMinor : null,
          observedCount,
          unknownCount,
        },
      ]
    }),
  ) as ServiceCommerceCostSummary
}
