import { createHash } from "node:crypto"
import {
  DirectMetaWhatsAppProvider,
  resolveCommunicationsCredential,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  claimServiceCommerceMediaRetrieval,
  getServiceCommerceMediaForSafety,
  getWhatsAppConnectionForBackend,
  recordStoredServiceCommerceMediaAsset,
  rejectServiceCommerceMediaRetrieval,
  requestServiceCommerceMediaSafety,
  scheduleServiceCommerceMediaRetry,
} from "@ewatrade/db/queries"
import {
  type PrivateMediaProvider,
  SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES,
  detectServiceCommerceMediaMimeType,
  getConfiguredPrivateMediaProvider,
  serviceCommerceMediaMimeTypeSchema,
} from "@ewatrade/service-commerce"

import { triggerJob } from "../trigger"
import { serviceCommerceMediaSafetyHandler } from "./service-commerce-media-safety"

export type ServiceCommerceMediaIngestPayload = {
  mediaAssetId: string
  storeId: string
  tenantId: string
}

type Dependencies = {
  claim(input: ServiceCommerceMediaIngestPayload): Promise<{
    provider: string | null
    providerConnectionId: string | null
    providerMediaId: string | null
  } | null>
  enqueueSafety(input: ServiceCommerceMediaIngestPayload): Promise<unknown>
  fetchMedia(input: {
    accessToken: string
    mediaId: string
    phoneNumberId: string
  }): Promise<{ bytes: Uint8Array; mediaType: string }>
  loadConnection(input: {
    connectionId: string
    tenantId: string
  }): Promise<{ credentialReference: string; phoneNumberId: string }>
  loadSafety(input: ServiceCommerceMediaIngestPayload): Promise<unknown | null>
  recordStored(
    input: ServiceCommerceMediaIngestPayload & {
      contentDigest: string
      objectKey: string
      reason: string
      verifiedMediaType:
        | "image/jpeg"
        | "image/png"
        | "image/webp"
        | "image/heic"
        | "image/heif"
        | "application/pdf"
      verifiedSizeBytes: number
    },
  ): Promise<unknown>
  requestSafety(input: ServiceCommerceMediaIngestPayload): Promise<unknown>
  reject(
    input: ServiceCommerceMediaIngestPayload & {
      failureCode: string
      reason: string
    },
  ): Promise<unknown>
  resolveCredential(reference: string): string
  scheduleRetry(
    input: ServiceCommerceMediaIngestPayload & {
      failureCode: string
      nextRetryAt: Date
      reason: string
      retryLifecycle: "pending_retrieval"
    },
  ): Promise<unknown>
  storage: PrivateMediaProvider
}

function defaultDependencies(): Dependencies {
  const provider = new DirectMetaWhatsAppProvider()
  return {
    claim: (input) => claimServiceCommerceMediaRetrieval(prisma, input),
    enqueueSafety: (input) =>
      triggerJob(
        "service-commerce.media-safety",
        serviceCommerceMediaSafetyHandler,
        input,
        { maxAttempts: 4 },
      ),
    fetchMedia: (input) => provider.fetchMedia(input),
    loadConnection: (input) => getWhatsAppConnectionForBackend(prisma, input),
    loadSafety: (input) => getServiceCommerceMediaForSafety(prisma, input),
    recordStored: (input) =>
      recordStoredServiceCommerceMediaAsset(prisma, input),
    reject: (input) => rejectServiceCommerceMediaRetrieval(prisma, input),
    requestSafety: (input) =>
      requestServiceCommerceMediaSafety(prisma, {
        ...input,
        reason: "provider_media_ready_for_safety",
      }),
    resolveCredential: resolveCommunicationsCredential,
    scheduleRetry: (input) => scheduleServiceCommerceMediaRetry(prisma, input),
    storage: getConfiguredPrivateMediaProvider(),
  }
}

function mediaFileName(mimeType: string) {
  if (mimeType === "application/pdf") return "customer-document.pdf"
  if (mimeType === "image/png") return "customer-image.png"
  if (mimeType === "image/webp") return "customer-image.webp"
  if (mimeType === "image/heic") return "customer-image.heic"
  if (mimeType === "image/heif") return "customer-image.heif"
  return "customer-image.jpg"
}

export async function runServiceCommerceMediaIngest(
  payload: ServiceCommerceMediaIngestPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claim = await dependencies.claim(payload)
  if (!claim) {
    if (await dependencies.loadSafety(payload)) {
      await dependencies.enqueueSafety(payload)
    }
    return null
  }
  if (
    claim.provider !== "meta" ||
    !claim.providerConnectionId ||
    !claim.providerMediaId
  ) {
    return dependencies.reject({
      ...payload,
      failureCode: "provider_reference_invalid",
      reason: "provider_reference_invalid",
    })
  }

  let result: unknown
  try {
    const connection = await dependencies.loadConnection({
      connectionId: claim.providerConnectionId,
      tenantId: payload.tenantId,
    })
    const fetched = await dependencies.fetchMedia({
      accessToken: dependencies.resolveCredential(
        connection.credentialReference,
      ),
      mediaId: claim.providerMediaId,
      phoneNumberId: connection.phoneNumberId,
    })
    const declared = serviceCommerceMediaMimeTypeSchema.safeParse(
      fetched.mediaType,
    )
    const signature = detectServiceCommerceMediaMimeType(fetched.bytes)
    if (
      !declared.success ||
      !signature ||
      signature !== declared.data ||
      fetched.bytes.byteLength > SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES
    ) {
      return dependencies.reject({
        ...payload,
        failureCode:
          fetched.bytes.byteLength > SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES
            ? "attachment_too_large"
            : "signature_mime_mismatch",
        reason: "provider_media_validation_failed",
      })
    }
    const stored = await dependencies.storage.store({
      bytes: fetched.bytes,
      fileName: mediaFileName(signature),
      mediaAssetId: payload.mediaAssetId,
      mimeType: signature,
    })
    result = await dependencies.recordStored({
      ...payload,
      contentDigest: createHash("sha256").update(fetched.bytes).digest("hex"),
      objectKey: stored.storageReference,
      reason: "provider_media_stored",
      verifiedMediaType: signature,
      verifiedSizeBytes: fetched.bytes.byteLength,
    })
  } catch (error) {
    await dependencies.scheduleRetry({
      ...payload,
      failureCode: "provider_retrieval_failed",
      nextRetryAt: new Date(Date.now() + 60_000),
      reason: "provider_retrieval_failed",
      retryLifecycle: "pending_retrieval",
    })
    throw error
  }
  await dependencies.requestSafety(payload)
  await dependencies.enqueueSafety(payload)
  return result
}

export async function serviceCommerceMediaIngestHandler(
  payload: ServiceCommerceMediaIngestPayload,
) {
  await runServiceCommerceMediaIngest(payload)
}
