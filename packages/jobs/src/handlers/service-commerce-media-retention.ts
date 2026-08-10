import { prisma } from "@ewatrade/db/client"
import {
  claimServiceCommerceMediaRetention,
  recordDeletedServiceCommerceMediaAsset,
} from "@ewatrade/db/queries"
import {
  type PrivateMediaProvider,
  getConfiguredPrivateMediaProvider,
} from "@ewatrade/service-commerce"

export type ServiceCommerceMediaRetentionPayload = {
  mediaAssetId: string
  storeId: string
  tenantId: string
}

type Dependencies = {
  claim(input: ServiceCommerceMediaRetentionPayload): Promise<{
    mediaAssetId: string
    storageReference: string | null
  } | null>
  complete(
    input: ServiceCommerceMediaRetentionPayload & { reason: string },
  ): Promise<unknown>
  storage: Pick<PrivateMediaProvider, "delete">
}

function defaultDependencies(): Dependencies {
  return {
    claim: (input) => claimServiceCommerceMediaRetention(prisma, input),
    complete: (input) => recordDeletedServiceCommerceMediaAsset(prisma, input),
    storage: getConfiguredPrivateMediaProvider(),
  }
}

export async function runServiceCommerceMediaRetention(
  payload: ServiceCommerceMediaRetentionPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claim = await dependencies.claim(payload)
  if (!claim) return null
  if (claim.storageReference) {
    await dependencies.storage.delete({
      mediaAssetId: claim.mediaAssetId,
      storageReference: claim.storageReference,
    })
  }
  return dependencies.complete({
    ...payload,
    reason: "baseline_retention_deleted",
  })
}

export async function serviceCommerceMediaRetentionHandler(
  payload: ServiceCommerceMediaRetentionPayload,
) {
  await runServiceCommerceMediaRetention(payload)
}
