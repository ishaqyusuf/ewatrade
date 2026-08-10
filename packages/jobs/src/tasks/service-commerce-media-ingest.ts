import { task } from "@trigger.dev/sdk/v3"

import {
  type ServiceCommerceMediaIngestPayload,
  serviceCommerceMediaIngestHandler,
} from "../handlers/service-commerce-media-ingest"

export const serviceCommerceMediaIngest = task({
  id: "service-commerce.media-ingest",
  maxDuration: 300,
  queue: { concurrencyLimit: 10 },
  run: async (input: ServiceCommerceMediaIngestPayload) => {
    await serviceCommerceMediaIngestHandler(input)
  },
})
