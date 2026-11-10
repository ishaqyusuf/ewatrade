"use client"

import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs"

export const SHIPMENT_STEPS = [
  "edit",
  "rates",
  "costs",
  "landed",
  "prices",
  "arrival",
] as const
export type ShipmentStep = (typeof SHIPMENT_STEPS)[number]

/** `shipment` is a record id or "new"; steps open inside its sheet. */
export function useShipmentParams() {
  const [params, setParams] = useQueryStates({
    shipment: parseAsString,
    shipmentStep: parseAsStringEnum([...SHIPMENT_STEPS]),
    shipmentLine: parseAsString,
  })
  return {
    shipmentId: params.shipment,
    step: params.shipmentStep,
    lineId: params.shipmentLine,
    setParams,
  }
}
