import { catalogAiRecoveryCandidates } from "@ewatrade/db/catalog-ai-images"
import { prisma } from "@ewatrade/db/client"
import { catalogAiImageHandler } from "./handlers/catalog-ai-image"
import { triggerJob } from "./trigger"

export async function enqueueCatalogAiImage(jobId: string) {
  await triggerJob(
    "catalog.ai-image.generate",
    catalogAiImageHandler,
    { jobId },
    { maxAttempts: 1 },
  )
}
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
