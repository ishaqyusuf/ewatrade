import {
  STOREFRONT_GENERATION_CONFIGURATION_KEY,
  readStorefrontGenerationConfiguration,
} from "@ewatrade/ai/storefront-design"
import { prisma } from "@ewatrade/db/client"
import { idempotencyKeys, task } from "@trigger.dev/sdk/v3"
import { storefrontDesignHandler } from "../handlers/storefront-design"

export const storefrontDesign = task({
  id: "storefront.design.generate",
  maxDuration: 180,
  queue: { name: "storefront-design", concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: (payload: { runId: string }) => storefrontDesignHandler(payload),
})

/** Existing cadence enqueues at most two identifiers; no provider work in a sweep. */
export async function recoverStorefrontDesignRuns() {
  const setting = await prisma.systemConfiguration.findUnique({
    where: { key: STOREFRONT_GENERATION_CONFIGURATION_KEY },
    select: { value: true },
  })
  if (!readStorefrontGenerationConfiguration(setting?.value))
    return { enabled: false, enqueued: 0 }
  const runs = await prisma.siteDesignRun.findMany({
    where: {
      OR: [
        { status: "QUEUED" },
        {
          status: { in: ["RUNNING", "VALIDATING"] },
          leaseUntil: { lte: new Date() },
        },
      ],
    },
    select: { id: true, attempts: true },
    orderBy: { createdAt: "asc" },
    take: 2,
  })
  for (const run of runs)
    await storefrontDesign.trigger(
      { runId: run.id },
      {
        idempotencyKey: await idempotencyKeys.create(
          `storefront-design:${run.id}:${run.attempts}:${Math.floor(Date.now() / 300_000)}`,
        ),
      },
    )
  return { enabled: true, enqueued: runs.length }
}
