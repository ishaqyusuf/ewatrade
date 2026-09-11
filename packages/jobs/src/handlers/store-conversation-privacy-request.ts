import { prisma } from "@ewatrade/db/client"
import {
  claimStoreConversationPrivacyRequest,
  completeStoreConversationPrivacyRequest,
} from "@ewatrade/db/queries"

import { runServiceCommerceMediaRetention } from "./service-commerce-media-retention"

export type StoreConversationPrivacyRequestPayload = {
  privacyRequestId: string
}

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimStoreConversationPrivacyRequest>>
>

type Dependencies = {
  claim(input: StoreConversationPrivacyRequestPayload): Promise<Claim | null>
  complete(input: {
    claimToken: string
    deletedGenericMediaAssetIds: string[]
    privacyRequestId: string
  }): Promise<unknown>
  deleteGenericMedia(input: {
    mediaAssetId: string
    storeId: string
    tenantId: string
  }): Promise<unknown>
}

function defaultDependencies(): Dependencies {
  return {
    claim: (input) => claimStoreConversationPrivacyRequest(prisma, input),
    complete: (input) => completeStoreConversationPrivacyRequest(prisma, input),
    deleteGenericMedia: (input) => runServiceCommerceMediaRetention(input),
  }
}

export async function runStoreConversationPrivacyRequest(
  payload: StoreConversationPrivacyRequestPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claim = await dependencies.claim(payload)
  if (!claim) return null
  for (const mediaAssetId of claim.genericMediaAssetIds) {
    await dependencies.deleteGenericMedia({
      mediaAssetId,
      storeId: claim.storeId,
      tenantId: claim.tenantId,
    })
  }
  return dependencies.complete({
    claimToken: claim.claimToken,
    deletedGenericMediaAssetIds: claim.genericMediaAssetIds,
    privacyRequestId: claim.privacyRequestId,
  })
}

export async function storeConversationPrivacyRequestHandler(
  payload: StoreConversationPrivacyRequestPayload,
) {
  await runStoreConversationPrivacyRequest(payload)
}
