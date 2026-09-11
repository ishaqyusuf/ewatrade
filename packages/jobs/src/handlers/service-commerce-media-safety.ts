import { prisma } from "@ewatrade/db/client"
import {
  getServiceCommerceMediaForSafety,
  recordServiceCommerceMediaSafety,
} from "@ewatrade/db/queries"
import {
  type PrivateMediaSafetyProviderInput,
  type ServiceCommerceMediaMimeType,
  type ServiceCommercePrivateMediaSafetyLifecycle,
  getConfiguredPrivateMediaSafetyProvider,
} from "@ewatrade/service-commerce"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type ServiceCommerceMediaSafetyPayload = {
  mediaAssetId: string
  storeId: string
  tenantId: string
}

type SafetyRecord = {
  contentDigest: string | null
  mediaAssetId: string
  mimeType: string | null
  storageReference: string | null
  verifiedSizeBytes: number | null
}

type Dependencies = {
  assertProviderAllowed(input: {
    adapter: "live" | "test"
    tenantId: string
  }): Promise<unknown>
  inspect(
    input: PrivateMediaSafetyProviderInput,
  ): Promise<{ lifecycle: ServiceCommercePrivateMediaSafetyLifecycle }>
  load(input: ServiceCommerceMediaSafetyPayload): Promise<SafetyRecord | null>
  record(
    input: ServiceCommerceMediaSafetyPayload & {
      outcome: ServiceCommercePrivateMediaSafetyLifecycle
      reason: string
    },
  ): Promise<unknown>
}

function defaultDependencies(): Dependencies {
  const provider = getConfiguredPrivateMediaSafetyProvider()
  return {
    assertProviderAllowed: ({ adapter, tenantId }) =>
      assertQaJobProviderAllowed({
        adapter,
        operation: "media_analysis",
        tenantId,
      }),
    inspect: (input) => provider.inspect(input),
    load: (input) => getServiceCommerceMediaForSafety(prisma, input),
    record: (input) =>
      recordServiceCommerceMediaSafety(prisma, {
        ...input,
        reason: input.reason,
      }),
  }
}

function assertSafetyInput(
  record: SafetyRecord,
): PrivateMediaSafetyProviderInput {
  if (
    !record.contentDigest ||
    !record.mimeType ||
    !record.storageReference ||
    !record.verifiedSizeBytes
  ) {
    throw new Error("Service Commerce media is not ready for safety review.")
  }
  return {
    byteSize: record.verifiedSizeBytes,
    contentDigest: record.contentDigest,
    mediaAssetId: record.mediaAssetId,
    mimeType: record.mimeType as ServiceCommerceMediaMimeType,
    storageReference: record.storageReference,
  }
}

export async function runServiceCommerceMediaSafety(
  payload: ServiceCommerceMediaSafetyPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const media = await dependencies.load(payload)
  if (!media) {
    throw new Error("Service Commerce media is not ready for safety review.")
  }
  await dependencies.assertProviderAllowed({
    // The currently configured non-production implementation is registered and
    // deterministic; production fails closed until it supplies an adapter type.
    adapter: "test",
    tenantId: payload.tenantId,
  })
  const input = assertSafetyInput(media)
  let result: { lifecycle: ServiceCommercePrivateMediaSafetyLifecycle }
  try {
    result = await dependencies.inspect(input)
  } catch (error) {
    await dependencies.record({
      ...payload,
      outcome: "retryable",
      reason: "private_media_safety_provider_unavailable",
    })
    throw error
  }
  return dependencies.record({
    ...payload,
    outcome: result.lifecycle,
    reason: "private_media_safety_completed",
  })
}

export async function serviceCommerceMediaSafetyHandler(
  payload: ServiceCommerceMediaSafetyPayload,
) {
  await runServiceCommerceMediaSafety(payload)
}
