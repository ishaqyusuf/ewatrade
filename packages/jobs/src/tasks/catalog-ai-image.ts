import { task } from "@trigger.dev/sdk/v3"
import { catalogAiImageHandler } from "../handlers/catalog-ai-image"

export const catalogAiImage = task({
  id: "catalog.ai-image.generate",
  maxDuration: 300,
  queue: { name: "catalog-ai-images", concurrencyLimit: 2 },
  retry: { maxAttempts: 1 },
  run: catalogAiImageHandler,
})
