import { prisma } from "@ewatrade/db/client"
import {
  claimPrescriptionRetentionBatch,
  completePrescriptionRetentionBatch,
  listPrescriptionRetentionStoreIds,
} from "@ewatrade/db/queries"
import {
  type PrivateMediaProvider,
  getConfiguredPrivateMediaProvider,
} from "@ewatrade/prescriptions"

type Dependencies = {
  claim(input: {
    storeId: string
    tenantId: string
  }): ReturnType<typeof claimPrescriptionRetentionBatch>
  complete(
    input: Parameters<typeof completePrescriptionRetentionBatch>[1],
  ): Promise<unknown>
  listStores(): Promise<Array<{ storeId: string; tenantId: string }>>
  media: PrivateMediaProvider
}

function defaultDependencies(): Dependencies {
  return {
    claim: (input) => claimPrescriptionRetentionBatch(prisma, input),
    complete: (input) => completePrescriptionRetentionBatch(prisma, input),
    listStores: () => listPrescriptionRetentionStoreIds(prisma),
    media: getConfiguredPrivateMediaProvider(),
  }
}

export async function runPrescriptionRetention(
  dependencies: Dependencies = defaultDependencies(),
) {
  for (const { storeId, tenantId } of await dependencies.listStores()) {
    const batch = await dependencies.claim({ storeId, tenantId })
    if (!batch) continue
    const deletedMediaIds: string[] = []
    for (const media of batch.media) {
      await dependencies.media.delete(media.objectKey)
      deletedMediaIds.push(media.id)
    }
    await dependencies.complete({
      addressIds: batch.addressIds,
      auditRequestEventIds: batch.auditRequestEventIds,
      auditSensitiveAccessEventIds: batch.auditSensitiveAccessEventIds,
      auditStoreEventIds: batch.auditStoreEventIds,
      commercialOrderIds: batch.commercialOrderIds,
      commercialRequestIds: batch.commercialRequestIds,
      mediaIds: deletedMediaIds,
      messageIds: batch.messageIds,
      storeId: batch.storeId,
      tenantId: batch.tenantId,
      tokenRequestIds: batch.tokenRequestIds,
      transcriptIds: batch.transcriptIds,
    })
  }
}

export async function prescriptionRetentionHandler() {
  await runPrescriptionRetention()
}
