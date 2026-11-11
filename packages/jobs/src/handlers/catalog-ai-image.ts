import { createHash } from "node:crypto"
import {
  CatalogAiProviderError,
  generateCatalogAiImage,
  isCatalogAiProviderConfigured,
} from "@ewatrade/catalog/image-generation-openai"
import { processCatalogPhoto } from "@ewatrade/catalog/photo-processing"
import { isCatalogPhotoReviewConfigured } from "@ewatrade/catalog/photo-review-openai"
import { createCatalogPhotoStorageForScope } from "@ewatrade/catalog/photo-storage"
import { uploadCatalogPhoto } from "@ewatrade/catalog/photo-upload"
import {
  assertCatalogAiDispatch,
  claimCatalogAiImage,
  failCatalogAiImage,
  recordCatalogAiProviderUsage,
  recordCatalogAiResponse,
  settleCatalogAiImage,
} from "@ewatrade/db/catalog-ai-images"
import {
  createCatalogPhotoIntent,
  getCatalogPhotoReadTarget,
  getCatalogPhotoUploadTarget,
  recordVerifiedCatalogPhotoUpload,
} from "@ewatrade/db/catalog-photos"
import { prisma } from "@ewatrade/db/client"
import {
  catalogAiFactsSchema,
  catalogAiPolicySchema,
} from "@ewatrade/utils/catalog-ai-images"
import { catalogPhotoReviewHandler } from "./catalog-photo-review"

export async function catalogAiImageHandler({ jobId }: { jobId: string }) {
  const existing = await prisma.catalogAiImageJob.findUnique({
    where: { id: jobId },
    select: { state: true, outputAssetId: true },
  })
  if (existing?.state === "PENDING_REVIEW") {
    if (existing.outputAssetId)
      await catalogPhotoReviewHandler({ assetId: existing.outputAssetId })
    await settleCatalogAiImage(prisma, jobId)
    return
  }
  if (!isCatalogAiProviderConfigured() || !isCatalogPhotoReviewConfigured())
    return
  const job = await claimCatalogAiImage(prisma, jobId)
  if (!job?.dispatchToken) return
  const token = job.dispatchToken
  let dispatched = false
  let providerCompleted = false
  try {
    const actor = {
      tenantId: job.tenantId,
      storeId: job.storeId,
      actorUserId: job.actorUserId,
    }
    let source: { bytes: Uint8Array; generated: boolean } | undefined
    if (job.sourceAssetId) {
      const [target, generatedRoot] = await Promise.all([
        getCatalogPhotoReadTarget(prisma, {
          ...actor,
          assetId: job.sourceAssetId,
        }),
        prisma.catalogAiImageVersion.findFirst({
          where: {
            assetId: job.rootAssetId ?? job.sourceAssetId,
            tenantId: job.tenantId,
            storeId: job.storeId,
            sourceAssetId: null,
            removedAt: null,
          },
          select: { assetId: true },
        }),
      ])
      const bytes = await createCatalogPhotoStorageForScope(target.scope).read({
        scope: target.scope,
        photo: target.photo,
      })
      const processed = await processCatalogPhoto({
        bytes,
        contentType: target.photo.contentType,
      })
      source = { bytes: processed.display.bytes, generated: !!generatedRoot }
    }
    await assertCatalogAiDispatch(prisma, job.id, token)
    dispatched = true
    const response = await generateCatalogAiImage({
      facts: catalogAiFactsSchema.parse(job.facts),
      note: job.note,
      policy: catalogAiPolicySchema.parse(job.policySnapshot),
      safetyScope: `${job.tenantId}:${job.actorUserId}`,
      source,
    })
    await recordCatalogAiProviderUsage(prisma, {
      id: job.id,
      token,
      usage: response.usage,
      requestId: response.requestId,
    })
    providerCompleted = true
    const digest = createHash("sha256").update(response.bytes).digest("hex")
    const intent = await createCatalogPhotoIntent(prisma, {
      ...actor,
      clientOperationId: `ai-image:${job.id}`,
      contentDigest: digest,
      contentType: "image/webp",
      sizeBytes: response.bytes.length,
    })
    const target = await getCatalogPhotoUploadTarget(prisma, {
      ...actor,
      assetId: intent.assetId,
    })
    await uploadCatalogPhoto({
      request: new Request("http://internal.invalid/catalog-ai-result", {
        method: "PUT",
        headers: {
          "content-type": "image/webp",
          "content-length": String(response.bytes.length),
        },
        body: new Blob([response.bytes.slice().buffer], { type: "image/webp" }),
      }),
      target,
      storage: createCatalogPhotoStorageForScope(target.scope),
      validate: async (photo) => {
        await processCatalogPhoto(photo)
      },
      complete: (photo) =>
        recordVerifiedCatalogPhotoUpload(prisma, actor, photo),
    })
    await recordCatalogAiResponse(prisma, {
      id: job.id,
      token,
      outputAssetId: intent.assetId,
      usage: response.usage,
      requestId: response.requestId,
    })
    // Reuses the normal moderation/derivative path. A failed moderation transport
    // leaves the asset private and recoverable; it never regenerates the image.
    await catalogPhotoReviewHandler({ assetId: intent.assetId })
    await settleCatalogAiImage(prisma, job.id)
  } catch (error) {
    await failCatalogAiImage(prisma, {
      id: job.id,
      token,
      uncertain:
        dispatched &&
        !providerCompleted &&
        (!(error instanceof CatalogAiProviderError) || error.uncertain),
      beforeDispatch: !dispatched,
    })
    // Never copy prompts, source bytes, private paths or provider errors to logs.
  }
}
