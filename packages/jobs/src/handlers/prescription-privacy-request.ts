import { prisma } from "@ewatrade/db/client"
import {
  claimPrescriptionPrivacyRequest,
  completePrescriptionPrivacyRequest,
} from "@ewatrade/db/queries"
import {
  type PrivateMediaProvider,
  getConfiguredPrivateMediaProvider,
} from "@ewatrade/prescriptions"

export type PrescriptionPrivacyRequestPayload = {
  actorUserId: string
  privacyRequestId: string
}

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimPrescriptionPrivacyRequest>>
>

type Dependencies = {
  claim(input: { privacyRequestId: string }): Promise<Claim | null>
  complete(
    input: Parameters<typeof completePrescriptionPrivacyRequest>[1],
  ): Promise<unknown>
  media: PrivateMediaProvider
}

function defaultDependencies(): Dependencies {
  return {
    claim: (input) => claimPrescriptionPrivacyRequest(prisma, input),
    complete: (input) => completePrescriptionPrivacyRequest(prisma, input),
    media: getConfiguredPrivateMediaProvider(),
  }
}

export async function runPrescriptionPrivacyRequest(
  payload: PrescriptionPrivacyRequestPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claim = await dependencies.claim({
    privacyRequestId: payload.privacyRequestId,
  })
  if (!claim) return null
  const deletedMediaIds: string[] = []
  if (claim.type === "ERASURE") {
    for (const media of claim.media) {
      await dependencies.media.delete(media.objectKey)
      deletedMediaIds.push(media.id)
    }
  }
  return dependencies.complete({
    actorUserId: payload.actorUserId,
    deletedMediaIds,
    prescriptionRequestIds: claim.prescriptionRequestIds,
    privacyRequestId: claim.privacyRequestId,
    requestedChanges: claim.requestedChanges,
    storeId: claim.storeId,
    subjectReference: claim.subjectReference,
    tenantId: claim.tenantId,
    type: claim.type,
  })
}

export async function prescriptionPrivacyRequestHandler(
  payload: PrescriptionPrivacyRequestPayload,
) {
  await runPrescriptionPrivacyRequest(payload)
}
