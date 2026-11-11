import { catalogAiRecoveryCandidates } from "@ewatrade/db/catalog-ai-images"
import { prisma } from "@ewatrade/db/client"
import { enqueueCatalogAiImage } from "./handlers/catalog-ai-image"

export { enqueueCatalogAiImage }
export async function recoverCatalogAiImages() {
  const jobs = await catalogAiRecoveryCandidates(prisma)
  for (const job of jobs) {
    try {
      await enqueueCatalogAiImage(job.id)
    } catch {
      /* Durable rows keep their reservation and recovery eligibility. */
    }
  }
  return { attempted: jobs.length }
}
