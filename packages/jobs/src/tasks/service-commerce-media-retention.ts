import { task } from "@trigger.dev/sdk/v3"

import {
  type ServiceCommerceMediaRetentionPayload,
  serviceCommerceMediaRetentionHandler,
} from "../handlers/service-commerce-media-retention"

export const serviceCommerceMediaRetention = task({
  id: "service-commerce.media-retention",
  maxDuration: 300,
  queue: { concurrencyLimit: 5 },
  run: async (input: ServiceCommerceMediaRetentionPayload) => {
    await serviceCommerceMediaRetentionHandler(input)
  },
})
