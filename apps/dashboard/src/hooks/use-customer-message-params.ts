"use client"

import { customerMessageEvents } from "@ewatrade/customer-messages/client"
import { useQueryStates } from "nuqs"
import { parseAsString, parseAsStringEnum } from "nuqs/server"

const eventKeys = customerMessageEvents.map(({ key }) => key)

/**
 * The one WhatsApp message sheet. Opaque ids only: the customer's phone and
 * the message text never go into the address bar.
 */
export const customerMessageParams = {
  messageSheet: parseAsStringEnum([
    "order",
    "template",
    "compose-all",
  ] as const),
  messageOrderId: parseAsString,
  messageEvent: parseAsStringEnum(eventKeys),
  messageSource: parseAsString,
  messageScope: parseAsStringEnum(["business", "store"] as const),
  /** A just-recorded Order whose customer can be told; never auto-opens. */
  messageOffer: parseAsString,
}

export function useCustomerMessageParams() {
  const [params, setParams] = useQueryStates(customerMessageParams, {
    history: "push",
  })
  return {
    ...params,
    setParams,
    close: () =>
      setParams({
        messageSheet: null,
        messageOrderId: null,
        messageEvent: null,
        messageSource: null,
        messageScope: null,
        messageOffer: null,
      }),
  }
}
