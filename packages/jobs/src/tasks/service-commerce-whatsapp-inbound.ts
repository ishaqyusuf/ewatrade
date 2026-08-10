import { task } from "@trigger.dev/sdk/v3"

import {
  type ServiceCommerceWhatsAppInboundPayload,
  serviceCommerceWhatsAppInboundHandler,
} from "../handlers/service-commerce-whatsapp-inbound"

export const serviceCommerceWhatsAppInbound = task({
  id: "service-commerce.whatsapp-inbound",
  maxDuration: 300,
  queue: { concurrencyLimit: 10 },
  run: async (input: ServiceCommerceWhatsAppInboundPayload) => {
    await serviceCommerceWhatsAppInboundHandler(input)
  },
})
