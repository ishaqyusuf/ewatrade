import { task } from "@trigger.dev/sdk/v3"

import {
  type ServiceCommerceMediaSafetyPayload,
  serviceCommerceMediaSafetyHandler,
} from "../handlers/service-commerce-media-safety"

export const serviceCommerceMediaSafety = task({
  id: "service-commerce.media-safety",
  maxDuration: 300,
  queue: { concurrencyLimit: 10 },
  run: async (input: ServiceCommerceMediaSafetyPayload) => {
    await serviceCommerceMediaSafetyHandler(input)
  },
})
