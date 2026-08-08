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
  claim(storeId: string): ReturnType<typeof claimPrescriptionRetentionBatch>
  complete(
    input: Parameters<typeof completePrescriptionRetentionBatch>[1],
  ): Promise<unknown>
  listStores(): Promise<Array<{ storeId: string }>>
  media: PrivateMediaProvider
}

function defaultDependencies(): Dependencies {
  return {
    claim: (storeId) => claimPrescriptionRetentionBatch(prisma, { storeId }),
    complete: (input) => completePrescriptionRetentionBatch(prisma, input),
    listStores: () => listPrescriptionRetentionStoreIds(prisma),
    media: getConfiguredPrivateMediaProvider(),
  }
}

export async function runPrescriptionRetention(
  dependencies: Dependencies = defaultDependencies(),
) {
  for (const { storeId } of await dependencies.listStores()) {
    const batch = await dependencies.claim(storeId)
    if (!batch) continue
    const deletedMediaIds: string[] = []
    for (const media of batch.media) {
      await dependencies.media.delete(media.objectKey)
      deletedMediaIds.push(media.id)
    }
    await dependencies.complete({
      addressIds: batch.addressIds,
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
